const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createAiChatService,
  dataUrlForAttachment,
  normalizeAiChatMessages,
} = require("../src/modules/ai/chatService");

function createService() {
  const fixtures = {
    projects: [
      { id: "PRJ-001", name: "Portal", status: "active", owner: "PM", progress: 60, healthScore: 68, riskCount: 2 },
      { id: "PRJ-002", name: "Done", status: "done", owner: "PM", progress: 100, healthScore: 95, riskCount: 0 },
    ],
    requirements: [
      { id: "REQ-001", title: "Checkout", status: "testing", priority: "high", completion: 70, owner: "PDM", projectId: "PRJ-001" },
    ],
    tasks: [
      { id: "TASK-001", title: "Fix payment", status: "blocked", assignee: "Dev", projectId: "PRJ-001", requirementId: "REQ-001", remainingHours: 4 },
    ],
    defects: [
      { id: "BUG-001", title: "Timeout", severity: "high", status: "confirmed", assignee: "QA", projectId: "PRJ-001" },
      { id: "BUG-002", title: "Closed", severity: "low", status: "closed", assignee: "QA", projectId: "PRJ-001" },
    ],
    documents: [
      { id: "DOC-001", title: "Spec", type: "markdown", category: "project", aiStatus: "ready", updatedAt: "2026-07-15T00:00:00.000Z" },
    ],
    builds: [
      { id: "BLD-001", name: "Build", status: "released", projectId: "PRJ-001", version: "1.0.0" },
    ],
    releases: [
      { id: "REL-001", name: "Release", status: "staging", productId: "PROD-001", version: "1.0.0" },
    ],
  };
  return createAiChatService({
    extractTextFromUpload: () => "extracted document text",
    mapBuild: (item) => item,
    mapDefect: (item) => item,
    mapDocument: (item) => item,
    mapProject: (item) => item,
    mapRelease: (item) => item,
    mapRequirement: (item) => item,
    mapTask: (item) => item,
    rows: (sql) => {
      if (sql.includes("FROM projects")) return fixtures.projects;
      if (sql.includes("FROM requirements")) return fixtures.requirements;
      if (sql.includes("FROM tasks")) return fixtures.tasks;
      if (sql.includes("FROM defects")) return fixtures.defects;
      if (sql.includes("FROM documents")) return fixtures.documents;
      if (sql.includes("FROM builds")) return fixtures.builds;
      if (sql.includes("FROM releases")) return fixtures.releases;
      return [];
    },
  });
}

test("AI chat service normalizes messages and attachments for model-safe prompts", () => {
  const service = createService();
  const messages = normalizeAiChatMessages([
    { role: "system", content: " ignored role " },
    { role: "assistant", content: "ok" },
    { role: "user", content: "" },
  ]);
  assert.deepEqual(messages, [
    { role: "user", content: "ignored role" },
    { role: "assistant", content: "ok" },
  ]);

  const attachments = service.normalizeAttachments([
    { name: "spec.md", mimeType: "text/markdown", size: 10, contentBase64: "YmFzZTY0" },
    { name: "screen.png", mimeType: "image/png", size: 20, contentBase64: "aW1n" },
  ]);
  assert.equal(attachments[0].kind, "document");
  assert.equal(attachments[0].contentText, "extracted document text");
  assert.equal(attachments[1].kind, "image");
  assert.equal(dataUrlForAttachment(attachments[1]), "data:image/png;base64,aW1n");
});

test("AI chat service builds project context and fallback replies without performance scoring", async () => {
  const service = createService();
  const context = await service.buildContext();
  assert.equal(context.metrics.projects, 2);
  assert.equal(context.metrics.activeProjects, 1);
  assert.equal(context.metrics.riskyProjects, 1);
  assert.equal(context.metrics.blockedTasks, 1);
  assert.equal(context.metrics.openDefects, 1);

  const messages = [{ role: "user", content: "这个版本有什么风险？" }];
  const attachments = [{ kind: "document", name: "spec.md", mimeType: "text/markdown", size: 10, contentText: "验收标准" }];
  const prompt = await service.buildPrompt({ messages, attachments, scope: "delivery", currentPage: "DeliveryCenter" });
  assert.match(prompt, /当前页面：DeliveryCenter/);
  assert.match(prompt, /平台上下文/);
  assert.match(prompt, /验收标准/);

  const reply = await service.localReplyV2({ messages, attachments });
  assert.match(reply, /平台快照：2 个项目、1 条需求、1 个阻塞任务、1 个未关闭缺陷/);
  assert.doesNotMatch(reply, /绩效|评分|排名|薪酬|晋升|淘汰/);
});
