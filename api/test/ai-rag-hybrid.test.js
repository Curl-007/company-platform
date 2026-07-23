const assert = require("node:assert/strict");
const test = require("node:test");
const {
  embedLocal,
  embedRemote,
  cosineSimilarity,
  serializeEmbedding,
  parseEmbedding,
  LOCAL_PROVIDER,
} = require("../src/modules/ai/embedding");
const { hybridScore, rankChunksHybrid, ensureChunkEmbedding } = require("../src/modules/ai/ragSearch");
const { buildDocumentChunks } = require("../src/modules/ai/ragIndex");

test("local embedding is deterministic and L2-ish unit length", () => {
  const a = embedLocal("需求变更 审批流程");
  const b = embedLocal("需求变更 审批流程");
  assert.equal(a.provider, LOCAL_PROVIDER);
  assert.deepEqual(a.vector, b.vector);
  assert.equal(a.vector.length, 256);
  const norm = Math.sqrt(a.vector.reduce((sum, value) => sum + value * value, 0));
  assert.ok(Math.abs(norm - 1) < 1e-6 || norm === 0);
});

test("cosine similarity prefers related text over unrelated text", () => {
  const query = embedLocal("项目风险 交付延期");
  const related = embedLocal("交付风险上升，可能延期上线");
  const unrelated = embedLocal("今日菜单 番茄炒蛋");
  const relatedScore = cosineSimilarity(query.vector, related.vector);
  const unrelatedScore = cosineSimilarity(query.vector, unrelated.vector);
  assert.ok(relatedScore > unrelatedScore);
});

test("serialize/parse embedding round-trips", () => {
  const embedded = embedLocal("hello world");
  const json = serializeEmbedding(embedded.vector);
  const parsed = parseEmbedding(json);
  assert.deepEqual(parsed, embedded.vector);
});

test("hybridScore mixes keyword and vector components", () => {
  const onlyKeyword = hybridScore({ keywordScore: 10, vectorScore: null });
  assert.equal(onlyKeyword.mode, "keyword");
  const hybrid = hybridScore({ keywordScore: 10, vectorScore: 0.8 });
  assert.equal(hybrid.mode, "hybrid");
  assert.ok(hybrid.score > 0);
  assert.ok(hybrid.vectorComponent > 0);
});

test("buildDocumentChunks attaches local embeddings", () => {
  const chunks = buildDocumentChunks({
    id: "DOC-1",
    title: "需求说明",
    content: "本项目包含需求评审、设计与联调验收。",
    project_id: "PRJ-1",
  });
  assert.ok(chunks.length >= 1);
  assert.equal(chunks[0].embedding_provider, LOCAL_PROVIDER);
  assert.ok(parseEmbedding(chunks[0].embedding_vector)?.length > 0);
});

test("rankChunksHybrid returns hybrid hits for matching content", () => {
  const document = {
    id: "DOC-A",
    title: "风险管理",
    content: "识别交付风险并制定缓解措施，避免里程碑延期。",
    project_id: "PRJ-A",
    file_name: "risk.md",
    type: "spec",
    updated_at: "2026-07-21T00:00:00.000Z",
  };
  const chunks = buildDocumentChunks(document);
  const ranked = rankChunksHybrid({
    chunks,
    documentsById: new Map([[document.id, document]]),
    query: "交付风险 延期",
    limit: 5,
  });
  assert.equal(ranked.mode, "hybrid");
  assert.ok(ranked.hits.length >= 1);
  assert.equal(ranked.hits[0].document.id, document.id);
  assert.ok(ranked.hits[0].score > 0);
  assert.ok(ranked.hits[0].vectorScore >= 0);
});

test("ensureChunkEmbedding reuses stored vectors", () => {
  const embedded = embedLocal("stored vector sample");
  const chunk = {
    id: "DCH-1",
    content: "stored vector sample",
    embedding_vector: serializeEmbedding(embedded.vector),
    embedding_provider: LOCAL_PROVIDER,
    embedding_model: "hash-v1",
  };
  const ensured = ensureChunkEmbedding(chunk);
  assert.equal(ensured.persisted, true);
  assert.deepEqual(ensured.vector, embedded.vector);
});

test("remote embedding uses the policy-bound provider request path", async () => {
  const calls = [];
  const result = await embedRemote("delivery risk", {
    getConfig: async () => ({
      enabled: true,
      apiKey: "sk-test",
      baseUrl: "https://provider.example/v1",
      embeddingModel: "embedding-a",
      provider: "test-provider",
    }),
    requestImpl: async (baseUrl, endpoint, options) => {
      calls.push({ baseUrl, endpoint, body: JSON.parse(options.body), redirect: options.redirect });
      return {
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => ({ data: [{ embedding: [3, 4] }] }),
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].baseUrl, "https://provider.example/v1");
  assert.equal(calls[0].endpoint, "embeddings");
  assert.deepEqual(calls[0].body, { model: "embedding-a", input: "delivery risk" });
  assert.equal(calls[0].redirect, "error");
  assert.equal(result.provider, "test-provider");
  assert.deepEqual(result.vector, [0.6, 0.8]);
});
