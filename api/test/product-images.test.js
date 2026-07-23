const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const productImagesMigration = require("../migrations/20260723_21_product_images");
const openapi = require("../openapi.json");

const apiRoot = path.resolve(__dirname, "..");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function startApi(databaseFile, storageDir) {
  const port = await freePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: apiRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_FILE: databaseFile,
      STORAGE_DIR: storageDir,
      JWT_SECRET: "product-images-test-secret",
      SEED_DEMO_DATA: "1",
    },
    stdio: "ignore",
  });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) {
        return {
          port,
          async stop() {
            if (child.exitCode !== null) return;
            const exited = new Promise((resolve) => child.once("exit", resolve));
            child.kill();
            await exited;
          },
        };
      }
    } catch { /* wait for startup */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  child.kill();
  throw new Error("API did not start within 10 seconds.");
}

async function requestJson(port, pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, options);
  return { response, body: await response.json() };
}

function imageForm({ bytes = Buffer.from("image"), fileName = "image.png", mimeType = "image/png" } = {}) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mimeType }), fileName);
  return form;
}

async function uploadImage(port, productId, token, image = {}) {
  return requestJson(port, `/api/products/${productId}/images`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: imageForm(image),
  });
}

function queryDatabase(databaseFile, sql, ...params) {
  const db = new DatabaseSync(databaseFile);
  try {
    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
}

test("product image migration creates the table and unique indexes", () => {
  const db = new DatabaseSync(":memory:");
  try {
    productImagesMigration.up({ db });
    const columns = db.prepare("PRAGMA table_info(product_images)").all();
    assert.deepEqual(columns.map((column) => column.name), ["id", "product_id", "object_id", "sort_order", "created_at"]);
    assert.equal(columns.find((column) => column.name === "id").pk, 1);
    const indexes = db.prepare("PRAGMA index_list(product_images)").all();
    assert.equal(indexes.some((index) => index.name === "idx_product_images_object" && index.unique === 1), true);
    assert.equal(indexes.some((index) => index.name === "idx_product_images_product_sort" && index.unique === 1), true);
  } finally {
    db.close();
  }
});

test("product image OpenAPI contract exposes object operations and read-only compatibility fields", () => {
  assert.ok(openapi.paths["/api/products/{id}/images"]?.post);
  assert.ok(openapi.paths["/api/products/{id}/images/{imageId}"]?.delete);
  assert.ok(openapi.paths["/api/products/{id}/images/{imageId}/content"]?.get);
  assert.equal(openapi.components.schemas.Product.properties.images.items.$ref, "#/components/schemas/ProductImage");
  assert.equal(openapi.components.schemas.Product.properties.imageUrl.readOnly, true);
  assert.equal(openapi.components.schemas.Product.properties.imageUrls.readOnly, true);
  assert.equal("imageUrl" in openapi.components.schemas.ProductInput.properties, false);
  assert.equal("imageUrls" in openapi.components.schemas.ProductUpdateInput.properties, false);
});

test("product images use authenticated object upload, enforce limits, and clean up metadata and files", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pm-product-images-"));
  const databaseFile = path.join(directory, "app.db");
  const storageDir = path.join(directory, "storage");
  const api = await startApi(databaseFile, storageDir);
  t.after(async () => {
    await api.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const login = await requestJson(api.port, "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "Admin@123" }),
  });
  assert.equal(login.response.status, 200);
  const token = login.body.data.token;
  const jsonHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const authHeaders = { Authorization: `Bearer ${token}` };

  const created = await requestJson(api.port, "/api/products", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      name: "Image upload product",
      owner: "System Admin",
      imageUrl: "https://ignored.example/image.png",
      imageUrls: ["https://ignored.example/image-2.png"],
    }),
  });
  assert.equal(created.response.status, 201);
  assert.deepEqual(created.body.data.images, []);
  assert.equal(created.body.data.imageUrl, null);
  assert.deepEqual(created.body.data.imageUrls, []);
  const productId = created.body.data.id;

  const legacyUrls = ["https://legacy.example/one.png", "https://legacy.example/two.png"];
  const legacyDb = new DatabaseSync(databaseFile);
  try {
    legacyDb.prepare("UPDATE products SET image_url = ? WHERE id = ?").run(JSON.stringify(legacyUrls), productId);
  } finally {
    legacyDb.close();
  }
  const legacyList = await requestJson(api.port, "/api/products", { headers: authHeaders });
  const legacyProduct = legacyList.body.data.find((product) => product.id === productId);
  assert.deepEqual(legacyProduct.images, []);
  assert.equal(legacyProduct.imageUrl, legacyUrls[0]);
  assert.deepEqual(legacyProduct.imageUrls, legacyUrls);

  const firstUpload = await uploadImage(api.port, productId, token, {
    bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    fileName: "cover.png",
  });
  assert.equal(firstUpload.response.status, 201);
  assert.match(firstUpload.body.data.image.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(firstUpload.body.data.image.fileName, "cover.png");
  assert.equal(firstUpload.body.data.image.mimeType, "image/png");
  assert.equal(firstUpload.body.data.image.sortOrder, 0);
  assert.equal(firstUpload.body.data.product.images.length, 1);
  assert.equal(firstUpload.body.data.product.imageUrl, firstUpload.body.data.image.url);
  assert.deepEqual(firstUpload.body.data.product.imageUrls, [firstUpload.body.data.image.url]);
  const firstImage = firstUpload.body.data.image;
  const firstObject = queryDatabase(
    databaseFile,
    "SELECT object_id FROM product_images WHERE id = ?",
    firstImage.id,
  )[0];
  assert.match(firstObject.object_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

  const listed = await requestJson(api.port, "/api/products", { headers: authHeaders });
  const listedProduct = listed.body.data.find((product) => product.id === productId);
  assert.deepEqual(listedProduct.images, [firstImage]);
  assert.deepEqual(listedProduct.imageUrls, [firstImage.url]);

  const content = await fetch(`http://127.0.0.1:${api.port}${firstImage.url}`, { headers: authHeaders });
  assert.equal(content.status, 200);
  assert.equal(content.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await content.arrayBuffer()), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const unauthorizedContent = await fetch(`http://127.0.0.1:${api.port}${firstImage.url}`);
  assert.equal(unauthorizedContent.status, 401);
  const storedFilesBeforeRejectedUploads = fs.readdirSync(storageDir).sort();

  const svgExtension = await uploadImage(api.port, productId, token, {
    bytes: Buffer.from("<svg/>") ,
    fileName: "blocked.svg",
    mimeType: "image/png",
  });
  assert.equal(svgExtension.response.status, 400);
  assert.equal(svgExtension.body.errorCode, "UPLOAD_TYPE_NOT_ALLOWED");
  const svgMime = await uploadImage(api.port, productId, token, {
    bytes: Buffer.from("<svg/>") ,
    fileName: "blocked.png",
    mimeType: "image/svg+xml",
  });
  assert.equal(svgMime.response.status, 400);
  assert.equal(svgMime.body.errorCode, "UPLOAD_TYPE_NOT_ALLOWED");
  const mismatchedType = await uploadImage(api.port, productId, token, {
    bytes: Buffer.from("mismatch"),
    fileName: "mismatch.gif",
    mimeType: "image/png",
  });
  assert.equal(mismatchedType.response.status, 400);
  assert.equal(mismatchedType.body.errorCode, "UPLOAD_TYPE_NOT_ALLOWED");

  const oversized = await uploadImage(api.port, productId, token, {
    bytes: Buffer.alloc((5 * 1024 * 1024) + 1),
    fileName: "oversized.png",
  });
  assert.equal(oversized.response.status, 413);
  assert.equal(oversized.body.errorCode, "UPLOAD_TOO_LARGE");
  assert.equal(oversized.body.message, "Product image exceeds the 5 MiB limit.");

  const missingProduct = await uploadImage(api.port, "PROD-MISSING", token, { fileName: "missing.png" });
  assert.equal(missingProduct.response.status, 404);
  const unauthorizedUpload = await uploadImage(api.port, productId, null, { fileName: "unauthorized.png" });
  assert.equal(unauthorizedUpload.response.status, 401);
  assert.equal(
    queryDatabase(databaseFile, "SELECT id FROM objects WHERE bucket = 'product-images'").length,
    1,
  );
  assert.deepEqual(fs.readdirSync(storageDir).sort(), storedFilesBeforeRejectedUploads);

  const uploadedImages = [firstImage];
  for (let index = 1; index < 6; index += 1) {
    const upload = await uploadImage(api.port, productId, token, { fileName: `image-${index + 1}.png` });
    assert.equal(upload.response.status, 201);
    assert.equal(upload.body.data.image.sortOrder, index);
    uploadedImages.push(upload.body.data.image);
  }
  const seventh = await uploadImage(api.port, productId, token, { fileName: "image-7.png" });
  assert.equal(seventh.response.status, 409);
  assert.equal(seventh.body.errorCode, "PRODUCT_IMAGE_LIMIT_EXCEEDED");
  assert.equal(queryDatabase(databaseFile, "SELECT id FROM product_images WHERE product_id = ?", productId).length, 6);
  assert.equal(queryDatabase(databaseFile, "SELECT id FROM objects WHERE bucket = 'product-images'").length, 6);

  const blockedDelete = await requestJson(api.port, `/api/products/${productId}`, {
    method: "DELETE",
    headers: authHeaders,
  });
  assert.equal(blockedDelete.response.status, 409);
  assert.equal(blockedDelete.body.errorCode, "PRODUCT_HAS_DEPENDENCIES");
  assert.equal(blockedDelete.body.details.dependencies.productImages.count, 6);

  const storedFirstImage = queryDatabase(
    databaseFile,
    `SELECT object.storage_key
       FROM product_images image
       INNER JOIN objects object ON object.id = image.object_id
      WHERE image.id = ?`,
    firstImage.id,
  )[0];
  const firstImagePath = path.join(storageDir, storedFirstImage.storage_key);
  assert.equal(fs.existsSync(firstImagePath), true);
  const deleted = await requestJson(api.port, `/api/products/${productId}/images/${firstImage.id}`, {
    method: "DELETE",
    headers: authHeaders,
  });
  assert.equal(deleted.response.status, 200);
  assert.equal(deleted.body.data.deleted, true);
  assert.equal(deleted.body.data.product.images.length, 5);
  assert.equal(queryDatabase(databaseFile, "SELECT id FROM objects WHERE id NOT IN (SELECT object_id FROM product_images)").length, 0);
  assert.equal(fs.existsSync(firstImagePath), false);
  const deletedContent = await requestJson(api.port, firstImage.url, { headers: authHeaders });
  assert.equal(deletedContent.response.status, 404);

  for (const image of uploadedImages.slice(1)) {
    const response = await requestJson(api.port, `/api/products/${productId}/images/${image.id}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    assert.equal(response.response.status, 200);
  }
  const finalDelete = await requestJson(api.port, `/api/products/${productId}`, {
    method: "DELETE",
    headers: authHeaders,
  });
  assert.equal(finalDelete.response.status, 200);
});
