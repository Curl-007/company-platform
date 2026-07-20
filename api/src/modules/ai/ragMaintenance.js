function createRagMaintenance({ buildDocumentChunks, aiJobsRepository, run, now }) {
  function reindexDocumentForRag(document) {
    if (!document?.id) return 0;
    const chunks = buildDocumentChunks(document);
    return aiJobsRepository.replaceDocumentChunks(document, chunks, now());
  }

  function deleteDocumentRagIndex(documentId) {
    run("DELETE FROM rag_citation WHERE document_id = @documentId", { documentId });
    run("DELETE FROM document_chunk WHERE document_id = @documentId", { documentId });
  }

  return { reindexDocumentForRag, deleteDocumentRagIndex };
}

module.exports = { createRagMaintenance };
