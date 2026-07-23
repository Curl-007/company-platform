import { describe, expect, it } from 'vitest';
import { resolveCollaborationSaveAck } from './collaborationState';

const pending = {
  clientMutationId: 'mutation-1',
  content: 'saved draft',
  baseRevision: 4,
};

describe('resolveCollaborationSaveAck', () => {
  it('marks the draft clean only when it still equals the acknowledged content', () => {
    expect(resolveCollaborationSaveAck(pending, 'saved draft', {
      clientMutationId: 'mutation-1',
      revision: 5,
    }, 4)).toEqual({
      savedContent: 'saved draft',
      revision: 5,
      draftIsDirty: false,
    });
  });

  it('keeps edits made while the save was in flight dirty', () => {
    expect(resolveCollaborationSaveAck(pending, 'new local edit', {
      clientMutationId: 'mutation-1',
      revision: 5,
    }, 4)?.draftIsDirty).toBe(true);
  });

  it('ignores a stale acknowledgement for another mutation', () => {
    expect(resolveCollaborationSaveAck(pending, 'new local edit', {
      clientMutationId: 'mutation-old',
      revision: 5,
    }, 4)).toBeNull();
  });

  it('does not clear a newer remote conflict when an older save is acknowledged', () => {
    expect(resolveCollaborationSaveAck(pending, 'saved draft', {
      clientMutationId: 'mutation-1',
      revision: 5,
    }, 4, 6)?.draftIsDirty).toBe(true);
  });
});
