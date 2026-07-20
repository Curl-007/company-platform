const assert = require("node:assert/strict");
const test = require("node:test");
const { canManageDocument, canViewDocument } = require("../src/modules/documents/policy");

test("document collaboration write policy is no broader than REST document management", async () => {
  const document = { id: "DOC-001", project_id: "PRJ-001", owner_role: "pm" };
  const user = { id: "USR-DEV", role: "dev" };
  const context = {
    canAccessProject: () => true,
    canWriteProject: () => true,
    mapDocument: (item) => ({ ownerRole: item.owner_role }),
  };
  assert.equal(await canViewDocument(user, document, context), false);
  assert.equal(await canManageDocument(user, document, context), false);
  const projectManagerDocument = { ...document, owner_role: "dev" };
  assert.equal(await canViewDocument(user, projectManagerDocument, context), true);
  assert.equal(await canManageDocument(user, projectManagerDocument, context), true);
  assert.equal(await canManageDocument({ id: "USR-ADMIN", role: "admin" }, document, { ...context, canWriteProject: () => false }), false);
});
