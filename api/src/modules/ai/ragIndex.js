const crypto = require("node:crypto");

const DEFAULT_CHUNK_SIZE = 900;
const DEFAULT_OVERLAP = 120;

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function tokenizeQuery(query) {
  return [...new Set(String(query || "").toLowerCase().split(/\s+/).map((item) => item.trim()).filter(Boolean))];
}

function compactSnippet(text, query, maxLength = 260) {
  const source = normalizeText(text);
  if (!source) return "";
  const terms = tokenizeQuery(query);
  const lower = source.toLowerCase();
  const indexes = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0);
  const index = indexes.length ? Math.min(...indexes) : -1;
  const start = Math.max(0, index === -1 ? 0 : index - 80);
  const snippet = source.slice(start, start + maxLength);
  return `${start > 0 ? "..." : ""}${snippet}${start + maxLength < source.length ? "..." : ""}`;
}

function estimateTokens(text) {
  const source = normalizeText(text);
  if (!source) return 0;
  const asciiWords = source.match(/[A-Za-z0-9_]+/g)?.length || 0;
  const cjkChars = source.match(/[\u3400-\u9fff]/g)?.length || 0;
  return Math.max(1, Math.ceil(asciiWords * 1.3 + cjkChars / 1.8));
}

function chunkText(text, { chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP } = {}) {
  const source = normalizeText(text);
  if (!source) return [];
  const chunks = [];
  let start = 0;
  while (start < source.length) {
    const hardEnd = Math.min(source.length, start + chunkSize);
    let end = hardEnd;
    if (hardEnd < source.length) {
      const sentenceBoundary = Math.max(
        source.lastIndexOf("。", hardEnd),
        source.lastIndexOf(".", hardEnd),
        source.lastIndexOf("\n", hardEnd),
        source.lastIndexOf("；", hardEnd),
        source.lastIndexOf(";", hardEnd),
      );
      if (sentenceBoundary > start + chunkSize * 0.55) end = sentenceBoundary + 1;
    }
    const content = source.slice(start, end).trim();
    if (content) chunks.push(content);
    if (end >= source.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

function buildDocumentChunks(document, options = {}) {
  const { embedLocal, serializeEmbedding, LOCAL_PROVIDER, LOCAL_MODEL } = require("./embedding");
  const title = normalizeText(document?.title);
  const body = normalizeText(document?.content || document?.file_name || document?.fileName || title);
  const source = body || title;
  if (!source) return [];
  return chunkText(source, options).map((content, index) => {
    const embedded = embedLocal(`${title}\n${content}`);
    return {
      id: `DCH-${sha256(`${document.id}:${index}:${content}`).slice(0, 24)}`,
      document_id: document.id,
      project_id: document.project_id || null,
      chunk_index: index,
      section_title: title || null,
      page_no: 1,
      content,
      content_hash: sha256(content),
      token_estimate: estimateTokens(content),
      embedding_provider: LOCAL_PROVIDER,
      embedding_model: LOCAL_MODEL,
      embedding_vector: serializeEmbedding(embedded.vector),
    };
  });
}

function scoreChunk(chunk, document, query) {
  const terms = tokenizeQuery(query);
  if (!terms.length) return { score: 0, matchedFields: [] };
  const fields = {
    title: document.title || "",
    content: chunk.content || "",
    fileName: document.file_name || "",
    type: document.type || "",
  };
  let score = 0;
  const matchedFields = [];
  for (const [field, value] of Object.entries(fields)) {
    const lower = String(value || "").toLowerCase();
    const matches = terms.filter((term) => lower.includes(term)).length;
    if (!matches) continue;
    matchedFields.push(field);
    score += matches * (field === "title" ? 5 : field === "content" ? 4 : 1);
  }
  return { score, matchedFields };
}

function mapChunkSearchResult({ chunk, document, query, score, matchedFields, citationId }) {
  return {
    documentId: document.id,
    chunkId: chunk.id,
    citationId,
    title: document.title,
    projectId: document.project_id || null,
    type: document.type,
    fileName: document.file_name,
    score,
    source: "keyword",
    matchFields: matchedFields,
    quote: compactSnippet(chunk.content || document.content || document.title || document.file_name, query),
    pageNo: Number(chunk.page_no) || 1,
    updatedAt: document.updated_at,
  };
}

module.exports = {
  buildDocumentChunks,
  compactSnippet,
  mapChunkSearchResult,
  scoreChunk,
  sha256,
  tokenizeQuery,
};
