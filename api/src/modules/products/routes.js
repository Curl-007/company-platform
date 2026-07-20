const express = require("express");

function normalizeProductImageUrls(body) {
  if (Array.isArray(body?.imageUrls)) {
    return body.imageUrls.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6);
  }
  const single = String(body?.imageUrl || "").trim();
  return single ? [single] : [];
}

function createProductsRouter({
  audit,
  canAccessProject,
  fail,
  hasPermission,
  insert,
  json,
  mapProduct,
  mapProject,
  mapRequirement,
  nextId,
  now,
  ok,
  parse,
  requireAnyPermission,
  requirePermission,
  row,
  rows,
  run,
}) {
  const router = express.Router();

  function canReadEntireProductCatalog(user) {
    return hasPermission(user, "product:*") || hasPermission(user, "project:*");
  }

  function visibleProductsForUser(user) {
    const products = rows("SELECT * FROM products").map(mapProduct);
    if (canReadEntireProductCatalog(user)) return products;
    const visibleProductIds = new Set(
      rows("SELECT id, product_id FROM projects WHERE deleted_at IS NULL")
        .filter((project) => canAccessProject(user, project.id))
        .map((project) => project.product_id)
        .filter(Boolean),
    );
    return products.filter((product) => visibleProductIds.has(product.id));
  }

  router.get("/programs", requireAnyPermission(["product:*", "project:*", "project:read"]), (req, res) => {
    const projects = rows("SELECT * FROM projects WHERE deleted_at IS NULL")
      .filter((project) => canAccessProject(req.user, project.id))
      .map(mapProject);
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

  router.get("/portfolios", requireAnyPermission(["product:*", "project:*", "project:read"]), (req, res) => {
    const products = visibleProductsForUser(req.user);
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

  router.get("/products", requireAnyPermission(["product:*", "project:*", "project:read"]), (req, res) => {
    res.json(ok(visibleProductsForUser(req.user)));
  });

  router.get("/products/:id/requirements", requireAnyPermission(["product:*", "project:*", "project:read"]), (req, res) => {
    const product = row("SELECT * FROM products WHERE id = @id", { id: req.params.id });
    if (!product) return fail(res, 404, "RESOURCE_NOT_FOUND", "Product not found.");
    if (!visibleProductsForUser(req.user).some((item) => item.id === product.id)) {
      return fail(res, 403, "PERMISSION_DENIED", "You cannot access this product's requirements.");
    }
    const requirements = rows(
      "SELECT * FROM requirements WHERE product_id = @productId AND deleted_at IS NULL ORDER BY id DESC",
      { productId: product.id },
    )
      .filter((requirement) => canAccessProject(req.user, requirement.project_id))
      .map(mapRequirement);
    res.json(ok(requirements));
  });

  router.post("/products", requirePermission("product:*"), (req, res) => {
    const {
      name, owner, version, stage, description, systemName, systemVersion,
      applicationVersion, modules, roadmap, hardwareInfo, systemInfo, applicationInfo,
      hardwareMetrics, systemMetrics, appMetrics,
    } = req.body || {};
    const imageUrls = normalizeProductImageUrls(req.body);
    if (!name || !owner) return fail(res, 400, "VALIDATION_FAILED", "Product name and owner are required.");
    const product = {
      id: nextId("PROD", "products"),
      name: String(name).trim(),
      owner: String(owner).trim(),
      version: version || "1.0.0",
      stage: stage || "design",
      description: description || "",
      image_url: imageUrls.length ? json(imageUrls) : null,
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
    insert("products", product);
    audit(req.user, "product.create", "product", product.id, null, product, req.ip);
    res.status(201).json(ok(mapProduct(row("SELECT * FROM products WHERE id = @id", { id: product.id }))));
  });

  router.patch("/products/:id", requirePermission("product:*"), (req, res) => {
    const before = row("SELECT * FROM products WHERE id = @id", { id: req.params.id });
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Product not found.");
    const hasImageUrls = Array.isArray(req.body?.imageUrls) || req.body?.imageUrl !== undefined;
    const fields = {
      name: req.body?.name,
      owner: req.body?.owner,
      version: req.body?.version,
      stage: req.body?.stage,
      description: req.body?.description,
      image_url: hasImageUrls ? json(normalizeProductImageUrls(req.body)) : undefined,
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
    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined) run(`UPDATE products SET ${key} = @value WHERE id = @id`, { id: req.params.id, value });
    });
    const after = row("SELECT * FROM products WHERE id = @id", { id: req.params.id });
    audit(req.user, "product.update", "product", req.params.id, before, after, req.ip);
    res.json(ok(mapProduct(after)));
  });

  router.delete("/products/:id", requirePermission("product:*"), (req, res) => {
    const before = row("SELECT * FROM products WHERE id = @id", { id: req.params.id });
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Product not found.");
    run("DELETE FROM products WHERE id = @id", { id: req.params.id });
    audit(req.user, "product.delete", "product", req.params.id, before, null, req.ip);
    res.json(ok({ success: true }));
  });

  return router;
}

module.exports = {
  createProductsRouter,
};
