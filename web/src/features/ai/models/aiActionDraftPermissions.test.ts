import { describe, expect, it } from 'vitest';
import type { SessionUser } from '../../../types';
import { aiActionKind, canWriteAiAction } from './aiActionDraftPermissions';

function user(operations: string[]): SessionUser {
  return {
    id: 'USR-1',
    name: 'Test User',
    email: 'test@example.com',
    role: 'pm',
    status: 'active',
    permissions: [],
    capabilities: { role: 'pm', pages: ['ai'], permissions: [], operations },
  } as SessionUser;
}

describe('AI action write permissions', () => {
  it('classifies each action family before permission evaluation', () => {
    expect(aiActionKind('create_requirement')).toBe('requirement');
    expect(aiActionKind('update_defect')).toBe('defect');
    expect(aiActionKind('delete_test_case')).toBe('test_case');
    expect(aiActionKind('create_task')).toBe('task');
    expect(aiActionKind('create_program')).toBe('product');
    expect(aiActionKind('create_release')).toBe('delivery');
    expect(aiActionKind('create_document')).toBe('document');
    expect(aiActionKind('create_sprint')).toBe('sprint');
    expect(aiActionKind('create_work_log')).toBe('personal');
    expect(aiActionKind('create_risk')).toBe('risk');
  });

  it('uses the server operation list as the authority for protected action families', () => {
    const current = user(['requirements:manage', 'projects:manage']);

    expect(canWriteAiAction(current, 'create_requirement')).toBe(true);
    expect(canWriteAiAction(current, 'create_task')).toBe(true);
    expect(canWriteAiAction(current, 'create_defect')).toBe(false);
    expect(canWriteAiAction(current, 'create_product')).toBe(false);
    expect(canWriteAiAction(current, 'create_document')).toBe(false);
  });

  it('allows delivery through either delivery or project management, while personal entries remain self-service', () => {
    expect(canWriteAiAction(user(['delivery:manage']), 'create_build')).toBe(true);
    expect(canWriteAiAction(user(['projects:manage']), 'create_release')).toBe(true);
    expect(canWriteAiAction(user([]), 'create_release')).toBe(false);
    expect(canWriteAiAction(null, 'create_work_log')).toBe(true);
    expect(canWriteAiAction(null, 'unknown_action')).toBe(false);
  });
});
