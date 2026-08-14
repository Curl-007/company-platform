import { describe, expect, it } from 'vitest';
import { aiActionResultDestination } from './aiActionDraftNavigation';

describe('AI action result navigation', () => {
  it('preserves the destination for every action domain', () => {
    expect(aiActionResultDestination('create_requirement', 'REQ-1')).toEqual({ page: 'requirements', query: { focus: 'REQ-1' } });
    expect(aiActionResultDestination('create_defect', 'BUG-1')).toEqual({ page: 'testing', query: { tab: 'defects', focus: 'BUG-1' } });
    expect(aiActionResultDestination('create_test_case', 'TC-1')).toEqual({ page: 'testing', query: { tab: 'cases', focus: 'TC-1' } });
    expect(aiActionResultDestination('create_task', 'TASK-1', 'PRJ-1')).toEqual({ page: 'projects', query: { focus: 'PRJ-1' } });
    expect(aiActionResultDestination('create_risk', 'RISK-1')).toEqual({ page: 'projects', query: { focus: 'RISK-1' } });
    expect(aiActionResultDestination('create_product', 'PROD-1')).toEqual({ page: 'products' });
    expect(aiActionResultDestination('create_program', 'PGM-1')).toEqual({ page: 'products' });
    expect(aiActionResultDestination('create_build', 'BLD-1')).toEqual({ page: 'delivery', query: { focus: 'BLD-1' } });
    expect(aiActionResultDestination('create_release', 'REL-1')).toEqual({ page: 'delivery', query: { focus: 'REL-1' } });
    expect(aiActionResultDestination('create_document', 'DOC-1')).toEqual({ page: 'documents', query: { focus: 'DOC-1' } });
    expect(aiActionResultDestination('create_time_entry', 'TIME-1')).toEqual({ page: 'mywork' });
  });

  it('leaves unknown action types without a navigation side effect', () => {
    expect(aiActionResultDestination('unrecognized_action', 'ID-1')).toBeNull();
  });
});
