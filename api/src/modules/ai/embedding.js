/**
 * Lightweight embedding helpers for hybrid RAG.
 *
 * Default: local hashed bag-of-tokens vectors (no external dependency).
 * Optional: OpenAI-compatible POST {baseUrl}/embeddings when AI is configured.
 *
 * Vectors are stored as JSON text in document_chunk.embedding_vector (as-built schema).
 */

const crypto = require("node:crypto");

const LOCAL_PROVIDER = "local-hash";
const LOCAL_MODEL = "hash-v1";
const LOCAL_DIMENSIONS = 256;

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  const source = normalizeText(text);
  if (!source) return [];
  const tokens = [];
  // Latin / number tokens
  const ascii = source.match(/[a-z0-9_]{2,}/g) || [];
  tokens.push(...ascii);
  // CJK unigrams + bigrams for better Chinese recall
  const cjk = source.match(/[\u3400-\u9fff]/g) || [];
  tokens.push(...cjk);
  for (let i = 0; i < cjk.length - 1; i += 1) {
    tokens.push(cjk[i] + cjk[i + 1]);
  }
  return tokens;
}

function hashToBucket(token, dimensions) {
  const digest = crypto.createHash("sha256").update(token).digest();
  // first 4 bytes as unsigned int
  const value = digest.readUInt32BE(0);
  return value % dimensions;
}

/**
 * Deterministic local embedding: signed hashed bag-of-tokens, L2-normalized.
 */
function embedLocal(text, { dimensions = LOCAL_DIMENSIONS } = {}) {
  const dims = Math.max(32, Number(dimensions) || LOCAL_DIMENSIONS);
  const vector = new Array(dims).fill(0);
  const tokens = tokenize(text);
  if (!tokens.length) {
    return {
      provider: LOCAL_PROVIDER,
      model: LOCAL_MODEL,
      dimensions: dims,
      vector,
    };
  }
  for (const token of tokens) {
    const bucket = hashToBucket(token, dims);
    // sign bit from next hash nibble of token
    const sign = crypto.createHash("sha1").update(token).digest()[0] % 2 === 0 ? 1 : -1;
    vector[bucket] += sign;
  }
  return {
    provider: LOCAL_PROVIDER,
    model: LOCAL_MODEL,
    dimensions: dims,
    vector: l2Normalize(vector),
  };
}

function l2Normalize(vector) {
  let sumSquares = 0;
  for (const value of vector) sumSquares += value * value;
  const norm = Math.sqrt(sumSquares);
  if (!norm) return vector.map(() => 0);
  return vector.map((value) => value / norm);
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) {
    const left = Number(a[i]) || 0;
    const right = Number(b[i]) || 0;
    dot += left * right;
  }
  // vectors are expected L2-normalized; still clamp for safety
  if (dot > 1) return 1;
  if (dot < -1) return -1;
  return dot;
}

function serializeEmbedding(vector) {
  return JSON.stringify(Array.isArray(vector) ? vector : []);
}

function parseEmbedding(value) {
  if (value == null || value === "") return null;
  if (Array.isArray(value)) return value.map((item) => Number(item) || 0);
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((item) => Number(item) || 0);
  } catch {
    return null;
  }
}

/**
 * Optional remote embeddings via OpenAI-compatible API.
 * Returns null when config missing or request fails (caller falls back to local).
 */
async function embedRemote(text, {
  getConfig,
  fetchImpl = fetch,
  timeoutMs = 15000,
  logger = console,
} = {}) {
  if (typeof getConfig !== "function") return null;
  let config;
  try {
    config = await getConfig();
  } catch {
    return null;
  }
  if (!config?.enabled || !config.apiKey || !config.baseUrl) return null;
  // Prefer dedicated embedding model if provided; otherwise skip remote (chat models may not embed).
  const model = config.embeddingModel || process.env.AI_EMBEDDING_MODEL || null;
  if (!model) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${String(config.baseUrl).replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ model, input: text }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      logger.warn?.(`embedding request failed: ${response.status} ${detail.slice(0, 160)}`);
      return null;
    }
    const data = await response.json();
    const vector = data?.data?.[0]?.embedding;
    if (!Array.isArray(vector) || !vector.length) return null;
    return {
      provider: config.provider || "openai-compatible",
      model,
      dimensions: vector.length,
      vector: l2Normalize(vector.map((item) => Number(item) || 0)),
    };
  } catch (error) {
    logger.warn?.(`embedding request error: ${error.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Embed text: try remote when configured, else local hash vectors.
 */
async function embedText(text, options = {}) {
  const remote = await embedRemote(text, options);
  if (remote) return remote;
  return embedLocal(text, options);
}

function createEmbeddingService(deps = {}) {
  return {
    localProvider: LOCAL_PROVIDER,
    localModel: LOCAL_MODEL,
    localDimensions: LOCAL_DIMENSIONS,
    embedLocal: (text, opts) => embedLocal(text, opts),
    embedText: (text, opts) => embedText(text, { ...deps, ...opts }),
    cosineSimilarity,
    serializeEmbedding,
    parseEmbedding,
  };
}

module.exports = {
  LOCAL_PROVIDER,
  LOCAL_MODEL,
  LOCAL_DIMENSIONS,
  embedLocal,
  embedRemote,
  embedText,
  cosineSimilarity,
  serializeEmbedding,
  parseEmbedding,
  l2Normalize,
  tokenize,
  createEmbeddingService,
};
