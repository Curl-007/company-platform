module.exports = {
  id: "20260715_16_rag_chunks_and_citations",
  up({ db }) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_chunk (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        project_id TEXT,
        chunk_index INTEGER NOT NULL,
        section_title TEXT,
        page_no INTEGER NOT NULL DEFAULT 1,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        token_estimate INTEGER NOT NULL DEFAULT 0,
        embedding_provider TEXT,
        embedding_model TEXT,
        embedding_vector TEXT,
        indexed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rag_citation (
        id TEXT PRIMARY KEY,
        query_hash TEXT NOT NULL,
        document_id TEXT NOT NULL,
        chunk_id TEXT NOT NULL,
        project_id TEXT,
        quote TEXT NOT NULL,
        score REAL NOT NULL,
        source TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_document_chunk_document ON document_chunk(document_id, chunk_index);
      CREATE INDEX IF NOT EXISTS idx_document_chunk_project ON document_chunk(project_id);
      CREATE INDEX IF NOT EXISTS idx_rag_citation_query_created ON rag_citation(query_hash, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_rag_citation_document ON rag_citation(document_id, created_at DESC);
    `);
  },
};
