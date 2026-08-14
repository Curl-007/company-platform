const assert = require("node:assert/strict");
const test = require("node:test");
const { createDocumentAccessPolicy } = require("../src/modules/documents/policy");
const { createProductImageUpload, isValidProductImage } = require("../src/modules/products/upload");
const { ensureRoleAllowed } = require("../src/modules/testing/validation");
const { createDocumentUpload } = require("../src/security/uploadPolicy");

function multerStub(captured) {
  return (options) => {
    captured.push(options);
    return { single: (field) => ({ field }) };
  };
}

test("document policy factory binds project and mapping dependencies", async () => {
  const policy = createDocumentAccessPolicy({
    canAccessProject: async (_user, projectId) => projectId === "PRJ-1",
    canWriteProject: async (_user, projectId) => projectId === "PRJ-1",
    mapDocument: (document) => ({ ownerRole: document.owner_role }),
  });
  const document = { owner_role: "dev", project_id: "PRJ-1" };
  assert.equal(await policy.canViewDocument({ role: "dev" }, document), true);
  assert.equal(await policy.canManageDocument({ role: "dev" }, document), true);
  assert.equal(await policy.canViewDocument({ role: "dev" }, { ...document, project_id: "PRJ-2" }), false);
});

test("upload middleware factories keep document and product file contracts", () => {
  const captured = [];
  const multer = multerStub(captured);
  const documentUpload = createDocumentUpload({ multer, storageDir: "storage" });
  const productUpload = createProductImageUpload({ multer, storageDir: "storage" });
  assert.equal(typeof documentUpload.single, "function");
  assert.equal(typeof productUpload.single, "function");
  assert.equal(captured[0].limits.fileSize, 25 * 1024 * 1024);
  assert.equal(captured[1].limits.fileSize, 5 * 1024 * 1024);
  assert.equal(isValidProductImage({ mimetype: "image/png", originalname: "icon.png" }), true);
  assert.equal(isValidProductImage({ mimetype: "image/jpeg", originalname: "icon.png" }), false);

  let accepted = null;
  captured[0].fileFilter({}, { mimetype: "application/pdf", originalname: "brief.pdf" }, (error, value) => {
    accepted = { error, value };
  });
  assert.deepEqual(accepted, { error: null, value: true });
  let rejected = null;
  captured[1].fileFilter({}, { mimetype: "image/bmp", originalname: "icon.bmp" }, (error, value) => {
    rejected = { code: error?.code, value };
  });
  assert.deepEqual(rejected, { code: "UPLOAD_TYPE_NOT_ALLOWED", value: undefined });
});

test("testing role validation remains a pure module contract", () => {
  assert.equal(ensureRoleAllowed("qa", ["qa", "dev"], "assigneeRole"), null);
  assert.equal(ensureRoleAllowed("pm", ["qa", "dev"], "assigneeRole"), "assigneeRole must be one of: qa, dev");
});
