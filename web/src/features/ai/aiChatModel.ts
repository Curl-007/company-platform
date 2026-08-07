import type { AiChatAttachment, AiChatMessage, AiJob, AiSummary } from '../../types';
import i18n, { getInterfaceLocale } from '../../i18n';

export interface AiSummaryExtended extends AiSummary {
  metrics?: {
    totalJobs?: number;
    awaitingReview?: number;
    failed?: number;
    writtenToBusiness?: number;
    avgConfidence?: number;
  };
  recentJobs?: Array<{
    jobId: string;
    scene: string;
    status: string;
    progress: number;
    currentStep: string;
  }>;
}

export interface JobReviewDraft {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  acceptanceCriteria: string;
}

export const MAX_ATTACHMENTS = 6;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_TOTAL_BYTES = 12 * 1024 * 1024;

export function validateAttachmentFiles(files: File[], currentBytes: number): string | null {
  const oversized = files.find((file) => file.size > MAX_ATTACHMENT_BYTES);
  if (oversized) return i18n.t('features.ai.aiChatModel.attachmentTooLarge', { name: oversized.name });
  const selectedBytes = files.reduce((total, file) => total + file.size, 0);
  if (currentBytes + selectedBytes > MAX_ATTACHMENTS_TOTAL_BYTES) {
    return i18n.t('features.ai.aiChatModel.attachmentsTooLarge');
  }
  return null;
}

export function nowIso() {
  return new Date().toISOString();
}

export function attachmentKind(file: File): 'image' | 'document' {
  return file.type.startsWith('image/') ? 'image' : 'document';
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      resolve(value.includes(',') ? value.split(',')[1] : value);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function canReadText(file: File) {
  return (
    file.type.startsWith('text/') ||
    ['application/json', 'application/xml', 'application/x-yaml', 'text/markdown'].includes(file.type) ||
    /\.(md|txt|json|csv|xml|yaml|yml|log)$/i.test(file.name)
  );
}

export async function fileToAttachment(file: File): Promise<AiChatAttachment> {
  const kind = attachmentKind(file);
  if (kind === 'image') {
    return {
      name: file.name,
      mimeType: file.type || 'image/png',
      size: file.size,
      kind,
      contentBase64: await fileToBase64(file),
    };
  }

  return {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    kind,
    contentText: canReadText(file) ? (await file.text()).slice(0, 12000) : '',
    contentBase64: await fileToBase64(file),
  };
}

export function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat(getInterfaceLocale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return '';
  }
}

export function formatSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function messageSource(message: AiChatMessage) {
  if (message.role !== 'assistant') return null;
  if (message.fallback) return { label: i18n.t('features.ai.aiChatModel.sourceRuleFallback'), status: 'warning' };
  if (message.generatedBy === 'error') return { label: i18n.t('features.ai.aiChatModel.sourceCallFailed'), status: 'risk' };
  if (message.modelUsed) return { label: i18n.t('features.ai.aiChatModel.sourceRealModel'), status: 'success' };
  return { label: i18n.t('features.ai.aiChatModel.sourceLocalPrompt'), status: 'neutral' };
}

export function attachmentReadState(item: AiChatAttachment, role: AiChatMessage['role']) {
  if (item.kind === 'image') return role === 'assistant' ? i18n.t('features.ai.aiChatModel.imageReceivedByModel') : i18n.t('features.ai.aiChatModel.imageAttached');
  if (item.contentText) return i18n.t('features.ai.aiChatModel.textRead');
  return role === 'assistant' ? i18n.t('features.ai.aiChatModel.backendProcessed') : i18n.t('features.ai.aiChatModel.awaitingBackendParsing');
}

export function arrayOfText(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      return String(record.title || record.name || record.summary || JSON.stringify(record));
    }
    return String(item);
  }).filter(Boolean).slice(0, 5);
}

export function firstRequirement(job: AiJob | null) {
  const requirements = job?.result?.requirements;
  return Array.isArray(requirements) && requirements[0] && typeof requirements[0] === 'object'
    ? requirements[0] as Record<string, unknown>
    : null;
}

export function normalizePriority(value: unknown): JobReviewDraft['priority'] {
  return value === 'high' || value === 'low' ? value : 'medium';
}

export function buildReviewDraft(job: AiJob | null): JobReviewDraft | null {
  const requirement = firstRequirement(job);
  if (!job || !requirement) return null;
  const criteria = Array.isArray(requirement.acceptanceCriteria)
    ? requirement.acceptanceCriteria.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  return {
    title: String(requirement.title || '').trim(),
    description: String(job.result?.summary || '').trim(),
    priority: normalizePriority(requirement.priority),
    acceptanceCriteria: criteria.join('\n'),
  };
}

export function jobSummary(job: AiJob | null) {
  if (!job?.result) return null;
  const result = job.result as Record<string, unknown>;
  return {
    summary: String(result.summary || ''),
    requirements: arrayOfText(result.requirements),
    risks: arrayOfText(result.risks),
    recommendations: arrayOfText(result.recommendations),
  };
}

export function createWelcomeMessage(content: string, id?: string): AiChatMessage {
  return {
    id: id ?? 'welcome',
    role: 'assistant',
    content,
    createdAt: nowIso(),
    generatedBy: 'local',
  };
}
