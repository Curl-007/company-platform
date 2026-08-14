const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { filterAsync } = require("../../lib/asyncIter");
const { PRODUCT_IMAGE_MAX_BYTES, isValidProductImage } = require("./upload");

const PRODUCT_IMAGE_MAX_COUNT = 6;

function createProductsRouter({
  audit,
  canAccessProject,
  fail,
  hasPermission,
  json,
  mapProduct,
  mapProject,
  mapRequirement,
  nextId,
  now,
  ok,
  productImageUpload,
  repository,
  requireAnyPermission,
  requirePermission,
  storageDir,
  transaction = async (work) => work(),
}) {
  const router = express.Router();
  const uploadSingle = productImageUpload?.single
    ? productImageUpload.single("file")
    : (_req, _res, next) => {
      const error = new Error("Product image upload middleware is not configured.");
      error.code = "UPLOAD_NOT_CONFIGURED";
      next(error);
    };

  function imageUrl(productId, imageId) {
    return `/api/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}/content`;
  }

  function mapProductImage(item) {
    return {
      id: item.id,
      url: imageUrl(item.product_id, item.id),
      fileName: item.original_name,
      mimeType: item.mime_type,
      size: Number(item.size) || 0,
      sortOrder: Number(item.sort_order) || 0,
    };
  }

  async function listProductImages(productId) {
    return repository.listProductImages(productId);
  }

  async function mapProductWithImages(product) {
    const mapped = mapProduct(product);
    const images = (await listProductImages(product.id)).map(mapProductImage);
    const legacyImageUrls = Array.isArray(mapped.imageUrls) ? mapped.imageUrls.filter(Boolean) : [];
    const compatibleUrls = images.length ? images.map((image) => image.url) : legacyImageUrls;
    return {
      ...mapped,
      images,
      imageUrl: compatibleUrls[0] || null,
      imageUrls: compatibleUrls,
    };
  }

  function safeUnlink(storageKey) {
    if (!storageKey || !storageDir) return;
    try { fs.unlinkSync(path.join(storageDir, storageKey)); } catch { /* file may already be absent */ }
  }

  function validProductImage(file) {
    return isValidProductImage(file);
  }

  function canReadEntireProductCatalog(user) {
    return hasPermission(user, "product:*") || hasPermission(user, "project:*");
  }

  async function visibleProductsForUser(user) {
    let products = await repository.listProducts();
    if (canReadEntireProductCatalog(user)) return Promise.all(products.map(mapProductWithImages));
    const __src_visibleProductIds = await repository.listLiveProjects();
    const __mid_visibleProductIds = await filterAsync(__src_visibleProductIds, async (project) => await canAccessProject(user, project.id));
    const visibleProductIds = new Set(__mid_visibleProductIds.map((project) => project.product_id).filter(Boolean));
    products = products.filter((product) => visibleProductIds.has(product.id));
    return Promise.all(products.map(mapProductWithImages));
  }

  async function canReadProduct(user, productId) {
    if (canReadEntireProductCatalog(user)) return true;
    const projects = await repository.listLiveProductProjects(productId);
    for (const project of projects) {
      if (await canAccessProject(user, project.id)) return true;
    }
    return false;
  }

  async function authorizeProductRead(req, res, next) {
    const product = await repository.findProduct(req.params.id);
    if (!product) return fail(res, 404, "RESOURCE_NOT_FOUND", "Product not found.");
    if (!(await canReadProduct(req.user, product.id))) {
      return fail(res, 403, "PERMISSION_DENIED", "You cannot access this product image.");
    }
    req.authorizedProduct = product;
    return next();
  }

  async function authorizeProductWrite(req, res, next) {
    const product = await repository.findProduct(req.params.id);
    if (!product) return fail(res, 404, "RESOURCE_NOT_FOUND", "Product not found.");
    req.authorizedProduct = product;
    return next();
  }

  async function productDependencies(productId) {
    return repository.productDependencies(productId);
  }

  async function cascadeDeleteProduct(productId, options) {
    return repository.cascadeDeleteProduct(productId, options);
  }

  router.get("/programs", requireAnyPermission(["product:*", "project:*", "project:read"]), async (req, res) => {
    const __src_projects = await repository.listLiveProjects();
    const __mid_projects = await filterAsync(__src_projects, async (project) => await canAccessProject(req.user, project.id));
    const projects = __mid_projects.map(mapProject);
    const grouped = new Map();
    projects.forEach((project) => {
      const key = project.programId || "unassigned";
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key === "unassigned" ? "PROG-UNASSIGNED" : key,
          name: key === "unassigned" ? "未归档项目集" : `项目集 ${key}`,
          owner: project.owner || "未设置",
          status: project.status,
          healthScores: [],
          progresses: [],
          projectIds: [],
          risks: [],
          updatedAt: project.updatedAt,
        });
      }
      const bucket = grouped.get(key);
      bucket.projectIds.push(project.id);
      bucket.healthScores.push(project.healthScore || 0);
      bucket.progresses.push(project.progress || 0);
      if ((project.riskCount || 0) > 0) bucket.risks.push(`${project.name} 有 ${project.riskCount} 个风险项`);
      if (new Date(project.updatedAt).getTime() > new Date(bucket.updatedAt).getTime()) bucket.updatedAt = project.updatedAt;
      if (project.owner) bucket.owner = project.owner;
      if (project.status === "active") bucket.status = "active";
    });
    const programs = [...grouped.values()].map((item) => ({
      id: item.id,
      name: item.name,
      owner: item.owner,
      status: item.status || "planning",
      healthScore: item.healthScores.length ? Math.round(item.healthScores.reduce((sum, score) => sum + score, 0) / item.healthScores.length) : 0,
      progress: item.progresses.length ? Math.round(item.progresses.reduce((sum, score) => sum + score, 0) / item.progresses.length) : 0,
      projectIds: item.projectIds,
      risks: item.risks,
      updatedAt: item.updatedAt || now(),
    }));
    res.json(ok(programs));
  });

  router.get("/portfolios", requireAnyPermission(["product:*", "project:*", "project:read"]), async (req, res) => {
    const products = await visibleProductsForUser(req.user);
    const grouped = new Map();
    products.forEach((product) => {
      const key = product.id.split("-")[1]?.slice(0, 1) ? `PORT-${product.id.split("-")[1].slice(0, 1)}` : "PORT-UNASSIGNED";
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key,
          name: key === "PORT-UNASSIGNED" ? "默认产品组合" : `产品组合 ${key.replace("PORT-", "")}`,
          owner: product.owner || "未设置",
          status: product.stage || "planned",
          productIds: [],
          roadmap: [],
        });
      }
      const bucket = grouped.get(key);
      bucket.productIds.push(product.id);
      bucket.owner = bucket.owner || product.owner || "未设置";
      bucket.roadmap.push(...(product.roadmap || []));
      if (["released", "maintenance"].includes(product.stage)) bucket.status = "released";
      else if (["development", "mvp"].includes(product.stage) && bucket.status !== "released") bucket.status = "development";
    });
    const portfolios = [...grouped.values()].map((item) => ({
      id: item.id,
      name: item.name,
      owner: item.owner,
      status: item.status || "planned",
      productIds: item.productIds,
      roadmap: item.roadmap.slice(0, 12),
    }));
    res.json(ok(portfolios));
  });

  router.get("/products", requireAnyPermission(["product:*", "project:*", "project:read"]), async (req, res) => {
    res.json(ok(await visibleProductsForUser(req.user)));
  });

  router.get("/products/:id/requirements", requireAnyPermission(["product:*", "project:*", "project:read"]), async (req, res) => {
    const product = await repository.findProduct(req.params.id);
    if (!product) return fail(res, 404, "RESOURCE_NOT_FOUND", "Product not found.");
    const visibleProducts = await visibleProductsForUser(req.user);
    if (!visibleProducts.some((item) => item.id === product.id)) {
      return fail(res, 403, "PERMISSION_DENIED", "You cannot access this product's requirements.");
    }
    const __src_requirements = await repository.listProductRequirements(product.id);
    const __mid_requirements = await filterAsync(__src_requirements, async (requirement) => await canAccessProject(req.user, requirement.project_id));
    const requirements = __mid_requirements.map(mapRequirement);
    res.json(ok(requirements));
  });

  router.post("/products", requirePermission("product:*"), async (req, res) => {
    const {
      name, owner, version, stage, description, systemName, systemVersion,
      applicationVersion, modules, roadmap, hardwareInfo, systemInfo, applicationInfo,
      hardwareMetrics, systemMetrics, appMetrics,
    } = req.body || {};
    if (!name || !owner) return fail(res, 400, "VALIDATION_FAILED", "Product name and owner are required.");
    const product = {
      id: await nextId("PROD", "products"),
      name: String(name).trim(),
      owner: String(owner).trim(),
      version: version || "1.0.0",
      stage: stage || "design",
      description: description || "",
      image_url: null,
      system_name: systemName || "",
      system_version: systemVersion || "",
      application_version: applicationVersion || "",
      modules: json(Array.isArray(modules) ? modules : []),
      roadmap: json(Array.isArray(roadmap) ? roadmap : []),
      hardware_info: json(hardwareInfo || {}),
      system_info: json(systemInfo || {}),
      application_info: json(applicationInfo || {}),
      hardware_metrics: json(Array.isArray(hardwareMetrics) ? hardwareMetrics : []),
      system_metrics: json(Array.isArray(systemMetrics) ? systemMetrics : []),
      app_metrics: json(Array.isArray(appMetrics) ? appMetrics : []),
    };
    await repository.createProduct(product);
    await audit(req.user, "product.create", "product", product.id, null, product, req.ip);
    res.status(201).json(ok(await mapProductWithImages(await repository.findProduct(product.id))));
  });

  router.patch("/products/:id", requirePermission("product:*"), async (req, res) => {
    const before = await repository.findProduct(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Product not found.");
    const fields = {
      name: req.body?.name,
      owner: req.body?.owner,
      version: req.body?.version,
      stage: req.body?.stage,
      description: req.body?.description,
      system_name: req.body?.systemName,
      system_version: req.body?.systemVersion,
      application_version: req.body?.applicationVersion,
      modules: req.body?.modules ? json(req.body.modules) : undefined,
      roadmap: req.body?.roadmap ? json(req.body.roadmap) : undefined,
      hardware_info: req.body?.hardwareInfo ? json(req.body.hardwareInfo) : undefined,
      system_info: req.body?.systemInfo ? json(req.body.systemInfo) : undefined,
      application_info: req.body?.applicationInfo ? json(req.body.applicationInfo) : undefined,
      hardware_metrics: req.body?.hardwareMetrics ? json(req.body.hardwareMetrics) : undefined,
      system_metrics: req.body?.systemMetrics ? json(req.body.systemMetrics) : undefined,
      app_metrics: req.body?.appMetrics ? json(req.body.appMetrics) : undefined,
    };
    await repository.updateProductFields(req.params.id, fields);
    const after = await repository.findProduct(req.params.id);
    await audit(req.user, "product.update", "product", req.params.id, before, after, req.ip);
    res.json(ok(await mapProductWithImages(after)));
  });

  router.post(
    "/products/:id/images",
    requirePermission("product:*"),
    authorizeProductWrite,
    uploadSingle,
    async (req, res) => {
      if (!req.file) return fail(res, 400, "VALIDATION_FAILED", "Image file is required.");
      const storageKey = req.file.filename;
      if (!validProductImage(req.file)) {
        safeUnlink(storageKey);
        return fail(res, 400, "UPLOAD_TYPE_NOT_ALLOWED", "Product images support PNG, JPEG, WebP, and GIF only.");
      }
      if (Number(req.file.size) > PRODUCT_IMAGE_MAX_BYTES) {
        safeUnlink(storageKey);
        return fail(res, 413, "UPLOAD_TOO_LARGE", "Product image exceeds the 5 MiB limit.");
      }
      const imageId = crypto.randomUUID();
      const objectId = crypto.randomUUID();
      const createdAt = now();
      try {
        const result = await transaction(async () => {
          const { count, sortOrder } = await repository.imageUploadPosition(req.params.id);
          if (count >= PRODUCT_IMAGE_MAX_COUNT) return { limitReached: true };
          await repository.createObject({
            id: objectId,
            bucket: "product-images",
            storage_key: storageKey,
            original_name: req.file.originalname,
            mime_type: req.file.mimetype,
            size: req.file.size,
            created_by: req.user.id,
            created_at: createdAt,
          });
          await repository.createProductImage({
            id: imageId,
            product_id: req.params.id,
            object_id: objectId,
            sort_order: sortOrder,
            created_at: createdAt,
          });
          const image = (await listProductImages(req.params.id)).find((item) => item.id === imageId);
          await audit(req.user, "product.image_upload", "product_image", imageId, null, image, req.ip);
          return {
            image: mapProductImage(image),
            product: await mapProductWithImages(req.authorizedProduct),
          };
        });
        if (result.limitReached) {
          safeUnlink(storageKey);
          return fail(res, 409, "PRODUCT_IMAGE_LIMIT_EXCEEDED", `A product can have at most ${PRODUCT_IMAGE_MAX_COUNT} images.`);
        }
        return res.status(201).json(ok(result));
      } catch (error) {
        safeUnlink(storageKey);
        throw error;
      }
    },
  );

  router.get("/products/:id/images/:imageId/content", authorizeProductRead, async (req, res) => {
    const image = await repository.findProductImageContent({ imageId: req.params.imageId, productId: req.params.id });
    if (!image) return fail(res, 404, "RESOURCE_NOT_FOUND", "Product image not found.");
    res.type(image.mime_type);
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(image.original_name)}`);
    return res.sendFile(path.resolve(storageDir, image.storage_key));
  });

  router.delete("/products/:id/images/:imageId", requirePermission("product:*"), authorizeProductWrite, async (req, res) => {
    const image = await repository.findProductImage({ imageId: req.params.imageId, productId: req.params.id });
    if (!image) return fail(res, 404, "RESOURCE_NOT_FOUND", "Product image not found.");
    const product = await transaction(async () => {
      await repository.deleteProductImage(image.id);
      await repository.deleteObject(image.object_id);
      await audit(req.user, "product.image_delete", "product_image", image.id, image, null, req.ip);
      return mapProductWithImages(req.authorizedProduct);
    });
    safeUnlink(image.storage_key);
    return res.json(ok({ deleted: true, id: image.id, product: await product }));
  });

  router.delete("/products/:id", requirePermission("product:*"), async (req, res) => {
    const before = await repository.findProduct(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Product not found.");
    const wantsCascade = req.query.cascade === "true";
    if (wantsCascade) {
      const result = await transaction(async () => {
        return cascadeDeleteProduct(req.params.id, { now: now() });
      });
      // Unlink physical image files only after the transaction commits,
      // so a rollback does not leave us with deleted DB rows but live files.
      for (const storageKey of result.imageStorageKeys) safeUnlink(storageKey);
      await audit(req.user, "product.cascade_delete", "product", req.params.id, before, null, req.ip);
      for (const item of result.snapshots.requirements) await audit(req.user, "product.cascade_delete", "requirement", item, { id: item, productId: req.params.id }, null, req.ip);
      for (const item of result.snapshots.releases) await audit(req.user, "product.cascade_delete", "release", item, { id: item, productId: req.params.id }, null, req.ip);
      for (const item of result.snapshots.images) await audit(req.user, "product.cascade_delete", "product_image", item, { id: item, productId: req.params.id }, null, req.ip);
      return res.json(ok({ success: true, cascaded: true }));
    }
    const outcome = await transaction(async () => {
      const dependencies = await productDependencies(req.params.id);
      if (Object.values(dependencies).some((dependency) => dependency.count > 0)) {
        return { dependencies };
      }
      await repository.deleteProduct(req.params.id);
      await audit(req.user, "product.delete", "product", req.params.id, before, null, req.ip);
      return { deleted: true };
    });
    if (outcome.dependencies) {
      return fail(
        res,
        409,
        "PRODUCT_HAS_DEPENDENCIES",
        "产品仍有关联项目、需求、发布、图片或产品组合，不能直接删除。",
        { dependencies: outcome.dependencies },
      );
    }
    res.json(ok({ success: true }));
  });

  return router;
}

module.exports = {
  createProductsRouter,
};
