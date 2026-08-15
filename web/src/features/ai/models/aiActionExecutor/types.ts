/** Shared shape of the executor's draft form values (see AiActionDraft in ../aiActionDraftModel). */
export interface AiActionDraftInput {
  title: string;
  name: string;
  projectId: string;
  productId: string;
  resourceId: string;
  status: string;
  priority: string;
  severity: string;
  description: string;
  content: string;
  criteria: string;
  assignee: string;
  assigneeRole: string;
  owner: string;
  taskType: string;
  estimatedHours: string;
  hours: string;
  workDate: string;
  version: string;
  buildId: string;
  objective: string;
  category: string;
  reason: string;
}

export type ActionExecResult = { type: string; id: string; label: string };

/** One action handler: validates the draft, performs the write, returns the affected id. */
export type AiActionHandler = (draft: AiActionDraftInput) => Promise<string>;

export function criteriaLines(text: string) {
  return text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
}
