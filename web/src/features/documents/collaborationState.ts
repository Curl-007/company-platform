export interface PendingCollaborationSave {
  clientMutationId: string;
  content: string;
  baseRevision: number;
}

export interface CollaborationSaveAck {
  clientMutationId?: string;
  revision?: number;
}

export interface ResolvedCollaborationSaveAck {
  savedContent: string;
  revision: number;
  draftIsDirty: boolean;
}

export function resolveCollaborationSaveAck(
  pending: PendingCollaborationSave | null,
  currentDraft: string,
  ack: CollaborationSaveAck,
  fallbackRevision: number,
  conflictingServerRevision?: number,
): ResolvedCollaborationSaveAck | null {
  if (!pending || ack.clientMutationId !== pending.clientMutationId) return null;
  const revision = Number(ack.revision) || fallbackRevision + 1;
  return {
    savedContent: pending.content,
    revision,
    draftIsDirty: currentDraft !== pending.content
      || Number(conflictingServerRevision || 0) > revision,
  };
}
