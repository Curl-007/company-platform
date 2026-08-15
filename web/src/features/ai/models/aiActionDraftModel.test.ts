import { describe, expect, it } from 'vitest';
import type { Project } from '../../../types';
import {
  aiActionDraftFormState,
  aiActionIdPlaceholder,
  aiActionLabelKey,
  aiActionStatusOptions,
  availableAiActionProjects,
  createAiActionDraft,
  updateAiActionDraftField,
  updateAiActionDraftObjective,
} from './aiActionDraftModel';

function project(id: string, status: string): Project {
  return {
    id,
    name: id,
    status,
  } as Project;
}

describe('AI action draft model', () => {
  it('keeps every supported proposed action translatable', () => {
    const supportedActionTypes = [
      'create_requirement', 'update_requirement', 'update_requirement_status', 'delete_requirement',
      'create_defect', 'update_defect', 'update_defect_status', 'delete_defect',
      'create_task', 'update_task', 'update_task_status', 'delete_task',
      'create_test_case', 'update_test_case', 'update_test_case_status', 'delete_test_case',
      'create_project', 'update_project', 'update_project_status', 'delete_project',
      'create_product', 'update_product', 'delete_product',
      'create_build', 'update_build', 'update_build_status', 'delete_build',
      'create_release', 'update_release_status', 'delete_release',
      'create_document', 'update_document', 'delete_document',
      'create_sprint', 'update_sprint', 'delete_sprint',
      'create_work_log', 'create_time_entry', 'create_risk',
      'create_program', 'create_portfolio', 'create_strategic_goal',
    ];

    expect(supportedActionTypes.every((type) => Boolean(aiActionLabelKey(type)))).toBe(true);
    expect(aiActionLabelKey('unrecognized_action')).toBeUndefined();
  });

  it('filters only archived and completed projects for action selections', () => {
    const projects = [
      project('PRJ-active', 'active'),
      project('PRJ-done', 'done'),
      project('PRJ-archived', 'archived'),
      project('PRJ-cancelled', 'cancelled'),
    ];

    expect(availableAiActionProjects(projects).map((item) => item.id)).toEqual(['PRJ-active', 'PRJ-cancelled']);
  });

  it('builds a complete editable draft from an action proposal', () => {
    const liveProjects = [project('PRJ-1', 'active')];
    const action = {
      type: 'create_requirement',
      name: 'Improve reporting',
      description: 'Export the report.',
      acceptanceCriteria: ['Exports CSV', 'Keeps filters'],
      assignee: 'Taylor',
      estimatedHours: 3.5,
      workDate: '2026-08-14',
    };

    expect(createAiActionDraft(action, liveProjects, { includeEstimatedHoursFallback: true })).toMatchObject({
      title: 'Improve reporting',
      name: 'Improve reporting',
      projectId: 'PRJ-1',
      description: 'Export the report.',
      content: 'Export the report.',
      criteria: 'Exports CSV\nKeeps filters',
      assignee: 'Taylor',
      owner: 'Taylor',
      estimatedHours: '3.5',
      hours: '3.5',
      workDate: '2026-08-14',
      priority: 'medium',
      severity: 'medium',
      taskType: 'task',
      category: 'project',
    });
    expect(createAiActionDraft(action, liveProjects).hours).toBe('');
  });

  it('derives the existing field visibility for create, update-status, and destructive actions', () => {
    expect(aiActionDraftFormState('create_requirement')).toMatchObject({
      isCreate: true,
      showTargetId: false,
      showTitle: true,
      showProject: true,
      showRequirementDetails: true,
      showAssignee: true,
    });
    expect(aiActionDraftFormState('update_task_status')).toMatchObject({
      isCreate: false,
      isStatus: true,
      showTargetId: true,
      showStatus: true,
      showTaskDetails: false,
      showAssignee: false,
    });
    expect(aiActionDraftFormState('create_document')).toMatchObject({
      showProject: true,
      showOwner: true,
      showContent: true,
    });
    expect(aiActionDraftFormState('create_time_entry')).toMatchObject({
      showProject: true,
      showTimeEntry: true,
    });
    expect(aiActionDraftFormState('delete_release')).toMatchObject({
      isDelete: true,
      showTargetId: true,
      showTitle: false,
    });
  });

  it('keeps paired draft fields in sync for the legacy executor payload', () => {
    const draft = createAiActionDraft({ type: 'create_project', title: 'Original', workDate: '2026-08-14' }, []);

    expect(updateAiActionDraftField(draft, 'title', 'Renamed')).toMatchObject({ title: 'Renamed', name: 'Renamed' });
    expect(updateAiActionDraftObjective(draft, 'Revised objective')).toMatchObject({
      objective: 'Revised objective',
      description: 'Revised objective',
    });
  });

  it('keeps status choices and target placeholders scoped to the action type', () => {
    expect(aiActionStatusOptions('update_requirement_status').map((item) => item.value)).toContain('approved');
    expect(aiActionStatusOptions('update_sprint')).toEqual([]);
    expect(aiActionIdPlaceholder('delete_test_case')).toBe('TC-xxx');
    expect(aiActionIdPlaceholder('delete_release')).toBe('REL-xxx');
    expect(aiActionIdPlaceholder('other')).toBe('ID');
  });
});
