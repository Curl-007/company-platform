function createProductsRepository({ insert, json = JSON.stringify, parse, row, rows, run }) {
  async function dependency(sqlFrom, params) {
    const count = Number((await row(`SELECT COUNT(*) AS count ${sqlFrom}`, params))?.count || 0);
    const sample = count > 0 ? await rows(`SELECT id ${sqlFrom} ORDER BY id LIMIT 10`, params) : [];
    return { count, sampleIds: sample.map((item) => item.id) };
  }

  async function productDependencies(productId) {
    const params = { id: productId };
    const [projects, requirements, releases, portfolioRows] = await Promise.all([
      dependency("FROM projects WHERE product_id = @id", params),
      dependency("FROM requirements WHERE product_id = @id", params),
      dependency("FROM releases WHERE product_id = @id", params),
      rows("SELECT id, product_ids FROM portfolios ORDER BY id"),
    ]);
    const productImages = await dependency("FROM product_images WHERE product_id = @id", params);
    const linkedPortfolios = portfolioRows
      .filter((portfolio) => {
        const productIds = parse(portfolio.product_ids, []);
        return Array.isArray(productIds) && productIds.includes(productId);
      })
      .map((portfolio) => portfolio.id);
    return {
      projects,
      requirements,
      releases,
      productImages,
      portfolios: { count: linkedPortfolios.length, sampleIds: linkedPortfolios.slice(0, 10) },
    };
  }

  // The caller owns transaction boundaries, physical file cleanup, and audit.
  async function cascadeDeleteProduct(productId, { now: deletedAt }) {
    const params = { id: productId };
    const requirementRows = await rows(
      "SELECT id FROM requirements WHERE product_id = @id AND deleted_at IS NULL ORDER BY id",
      params,
    );
    const releaseRows = await rows("SELECT id FROM releases WHERE product_id = @id ORDER BY id", params);
    const imageRows = await rows(
      `SELECT image.id AS image_id, image.object_id, object.storage_key
         FROM product_images image
         INNER JOIN objects object ON object.id = image.object_id
        WHERE image.product_id = @id ORDER BY image.id`,
      params,
    );
    const portfolioRows = await rows("SELECT id, product_ids FROM portfolios ORDER BY id");

    for (const requirement of requirementRows) {
      const reqParams = { id: requirement.id };
      const testCases = await rows("SELECT id FROM test_cases WHERE requirement_id = @id ORDER BY id", reqParams);
      for (const testCase of testCases) {
        const testCaseParams = { id: testCase.id };
        await run("DELETE FROM test_runs WHERE test_case_id = @id", testCaseParams);
        await run("DELETE FROM tasks WHERE source_type = 'test_case' AND source_id = @id", testCaseParams);
      }
      await run("DELETE FROM test_cases WHERE requirement_id = @id", reqParams);
      await run("DELETE FROM tasks WHERE requirement_id = @id", reqParams);
      await run("DELETE FROM defects WHERE requirement_id = @id", reqParams);
      await run(
        "UPDATE requirements SET deleted_at = @deletedAt WHERE parent_id = @id AND deleted_at IS NULL",
        { id: requirement.id, deletedAt },
      );
      await run(
        "UPDATE requirements SET deleted_at = @deletedAt WHERE id = @id AND deleted_at IS NULL",
        reqParams,
      );
    }

    for (const release of releaseRows) {
      await run("DELETE FROM release_approvals WHERE release_id = @id", { id: release.id });
      await run("DELETE FROM rollback_records WHERE release_id = @id", { id: release.id });
    }
    await run("DELETE FROM releases WHERE product_id = @id", params);

    for (const image of imageRows) {
      await run("DELETE FROM product_images WHERE id = @id", { id: image.image_id });
      await run("DELETE FROM objects WHERE id = @id", { id: image.object_id });
    }

    await run("UPDATE projects SET product_id = NULL WHERE product_id = @id", params);
    for (const portfolio of portfolioRows) {
      const productIds = parse(portfolio.product_ids, []);
      if (!Array.isArray(productIds) || !productIds.includes(productId)) continue;
      await run(
        "UPDATE portfolios SET product_ids = @productIds WHERE id = @id",
        { id: portfolio.id, productIds: json(productIds.filter((value) => value !== productId)) },
      );
    }
    await run("DELETE FROM products WHERE id = @id", params);

    return {
      imageStorageKeys: imageRows.map((image) => image.storage_key).filter(Boolean),
      snapshots: {
        requirements: requirementRows.map((item) => item.id),
        releases: releaseRows.map((item) => item.id),
        images: imageRows.map((image) => image.image_id),
      },
    };
  }

  async function updateProductFields(id, fields) {
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) await run(`UPDATE products SET ${key} = @value WHERE id = @id`, { id, value });
    }
  }

  return {
    listProducts: () => rows("SELECT * FROM products"),
    findProduct: (id) => row("SELECT * FROM products WHERE id = @id", { id }),
    createProduct: (product) => insert("products", product),
    updateProductFields,
    deleteProduct: (id) => run("DELETE FROM products WHERE id = @id", { id }),
    listLiveProjects: () => rows("SELECT * FROM projects WHERE deleted_at IS NULL"),
    listLiveProductProjects: (productId) => rows(
      "SELECT id FROM projects WHERE product_id = @productId AND deleted_at IS NULL",
      { productId },
    ),
    listProductRequirements: (productId) => rows(
      "SELECT * FROM requirements WHERE product_id = @productId AND deleted_at IS NULL ORDER BY id DESC",
      { productId },
    ),
    listProductImages: (productId) => rows(
      `SELECT image.id, image.product_id, image.sort_order,
              object.original_name, object.mime_type, object.size, object.storage_key
         FROM product_images image
         INNER JOIN objects object ON object.id = image.object_id
        WHERE image.product_id = @productId
        ORDER BY image.sort_order, image.created_at, image.id`,
      { productId },
    ),
    imageUploadPosition: async (productId) => {
      const count = Number((await row(
        "SELECT COUNT(*) AS count FROM product_images WHERE product_id = @productId",
        { productId },
      ))?.count || 0);
      const maxSortOrderValue = (await row(
        "SELECT MAX(sort_order) AS value FROM product_images WHERE product_id = @productId",
        { productId },
      ))?.value;
      const maxSortOrder = maxSortOrderValue == null ? null : Number(maxSortOrderValue);
      return { count, sortOrder: Number.isFinite(maxSortOrder) ? maxSortOrder + 1 : 0 };
    },
    createObject: (object) => insert("objects", object),
    createProductImage: (image) => insert("product_images", image),
    findProductImageContent: ({ imageId, productId }) => row(
      `SELECT image.id, object.storage_key, object.original_name, object.mime_type
         FROM product_images image
         INNER JOIN objects object ON object.id = image.object_id
        WHERE image.id = @imageId AND image.product_id = @productId`,
      { imageId, productId },
    ),
    findProductImage: ({ imageId, productId }) => row(
      `SELECT image.id, image.object_id, image.product_id, image.sort_order,
              object.storage_key, object.original_name, object.mime_type, object.size
         FROM product_images image
         INNER JOIN objects object ON object.id = image.object_id
        WHERE image.id = @imageId AND image.product_id = @productId`,
      { imageId, productId },
    ),
    deleteProductImage: (imageId) => run("DELETE FROM product_images WHERE id = @imageId", { imageId }),
    deleteObject: (objectId) => run("DELETE FROM objects WHERE id = @objectId", { objectId }),
    productDependencies,
    cascadeDeleteProduct,
  };
}

module.exports = { createProductsRepository };
