/**
 * Hybrid RAG ranking: keyword score + optional embedding cosine similarity.
 */

const { scoreChunk, mapChunkSearchResult, tokenizeQuery } = require("./ragIndex");
const {
  embedLocal,
  cosineSimilarity,
  parseEmbedding,
  serializeEmbedding,
  LOCAL_PROVIDER,
  LOCAL_MODEL,
} = require("./embedding");

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (number < 0) return 0;
  if (number > 1) return 1;
  return number;
}

/**
 * Combine keyword and vector signals into a single score.
 * keywordMax is used to normalize keyword hits into 0..1.
 */
function hybridScore({ keywordScore, vectorScore, keywordWeight = 0.55, vectorWeight = 0.45, keywordMax = 20 }) {
  const kw = keywordMax > 0 ? clamp01(keywordScore / keywordMax) : 0;
  const vec = clamp01(vectorScore);
  // If vector missing, fall back to keyword-only.
  if (vectorScore == null || Number.isNaN(vectorScore)) {
    return { score: keywordScore, keywordComponent: kw, vectorComponent: 0, mode: "keyword" };
  }
  const combined = keywordWeight * kw + vectorWeight * vec;
  // Keep a readable absolute score for API consumers (scale to ~keyword magnitude).
  return {
    score: Math.round(combined * 1000) / 1000,
    keywordComponent: Math.round(kw * 1000) / 1000,
    vectorComponent: Math.round(vec * 1000) / 1000,
    mode: "hybrid",
  };
}

function ensureChunkEmbedding(chunk, { force = false } = {}) {
  const existing = parseEmbedding(chunk.embedding_vector);
  if (!force && existing && existing.length) {
    return {
      vector: existing,
      provider: chunk.embedding_provider || LOCAL_PROVIDER,
      model: chunk.embedding_model || LOCAL_MODEL,
      persisted: true,
    };
  }
  const embedded = embedLocal(`${chunk.section_title || ""}\n${chunk.content || ""}`);
  return {
    vector: embedded.vector,
    provider: embedded.provider,
    model: embedded.model,
    persisted: false,
    embedding_vector: serializeEmbedding(embedded.vector),
    embedding_provider: embedded.provider,
    embedding_model: embedded.model,
  };
}

/**
 * Rank chunks for a query.
 * @returns {{ mode: string, hits: Array, queryEmbedding: object }}
 */
function rankChunksHybrid({
  chunks,
  documentsById,
  query,
  limit = 10,
  keywordWeight = 0.55,
  vectorWeight = 0.45,
}) {
  const terms = tokenizeQuery(query);
  if (!terms.length) {
    return { mode: "keyword", hits: [], queryEmbedding: null };
  }

  const queryEmbedding = embedLocal(query);
  const prepared = [];
  let anyVector = false;

  for (const chunk of chunks) {
    const document = documentsById.get(chunk.document_id);
    if (!document) continue;
    const { score: keywordScore, matchedFields } = scoreChunk(chunk, document, query);
    const ensured = ensureChunkEmbedding(chunk);
    const vectorScore = cosineSimilarity(queryEmbedding.vector, ensured.vector);
    if (ensured.vector?.length) anyVector = true;
    const hybrid = hybridScore({
      keywordScore,
      vectorScore: ensured.vector?.length ? Math.max(0, vectorScore) : null,
      keywordWeight,
      vectorWeight,
    });
    // Drop pure noise: require some keyword hit OR a strong vector hit.
    if (keywordScore <= 0 && (vectorScore == null || vectorScore < 0.12)) continue;
    prepared.push({
      chunk: {
        ...chunk,
        embedding_vector: ensured.embedding_vector || chunk.embedding_vector,
        embedding_provider: ensured.provider,
        embedding_model: ensured.model,
      },
      document,
      keywordScore,
      vectorScore: Math.round((vectorScore || 0) * 1000) / 1000,
      matchedFields,
      score: hybrid.mode === "hybrid" ? hybrid.score : keywordScore,
      scoreMode: hybrid.mode,
      keywordComponent: hybrid.keywordComponent,
      vectorComponent: hybrid.vectorComponent,
      needsPersist: !ensured.persisted,
    });
  }

  prepared.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if ((b.vectorScore || 0) !== (a.vectorScore || 0)) return (b.vectorScore || 0) - (a.vectorScore || 0);
    return String(b.document.updated_at || "").localeCompare(String(a.document.updated_at || ""));
  });

  const hits = prepared.slice(0, limit);
  const mode = anyVector && hits.some((item) => item.scoreMode === "hybrid") ? "hybrid" : "keyword";
  return { mode, hits, queryEmbedding };
}

function mapHybridSearchResult(hit, { query, citationId }) {
  const base = mapChunkSearchResult({
    chunk: hit.chunk,
    document: hit.document,
    query,
    score: hit.score,
    matchedFields: hit.matchedFields,
    citationId,
  });
  return {
    ...base,
    source: hit.scoreMode === "hybrid" ? "hybrid" : "keyword",
    keywordScore: hit.keywordScore,
    vectorScore: hit.vectorScore,
    scoreMode: hit.scoreMode,
  };
}

module.exports = {
  hybridScore,
  ensureChunkEmbedding,
  rankChunksHybrid,
  mapHybridSearchResult,
  clamp01,
};
