import { buildQuery, unwrap, unwrapDel, unwrapPatch, unwrapPost } from '../../services/apiClient';
import type { AiJob, Document } from '../../types';

export interface DocumentFilters {
  type?: string;
  category?: string;
  projectId?: string;
  ownerRole?: string;
}

export function fetchDocuments(filters: DocumentFilters = {}): Promise<Document[]> {
  return unwrap<Document[]>(`/api/documents${buildQuery(filters as Record<string, string | undefined>)}`);
}

export interface UploadDocumentInput {
  title: string;
  type: string;
  category?: string;
  owner: string;
  ownerRole?: string;
  projectId?: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  contentBase64?: string;
}

export function uploadDocument(input: UploadDocumentInput): Promise<Document> {
  return unwrapPost<Document>('/api/documents', input);
}

export interface AnalyzeDocumentInput {
  documentId: string;
  type?: string;
  projectId?: string;
  portfolioId?: string;
  analysisGoals?: string[];
}

export function analyzeDocument(input: AnalyzeDocumentInput): Promise<AiJob> {
  return unwrapPost<AiJob>('/api/ai/documents/analyze', input);
}

export interface UpdateDocumentInput {
  title?: string;
  type?: string;
  category?: string;
  owner?: string;
  ownerRole?: string;
  projectId?: string | null;
}

export function updateDocument(id: string, input: UpdateDocumentInput): Promise<Document> {
  return unwrapPatch<Document>(`/api/documents/${id}`, input);
}

export function deleteDocument(id: string): Promise<{ deleted: boolean }> {
  return unwrapDel<{ deleted: boolean }>(`/api/documents/${id}`);
}
