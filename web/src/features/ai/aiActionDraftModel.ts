import type { AiProposedAction, Project } from '../../types';
import {
  BUILD_STATUSES,
  DEFECT_STATUS_LABELS,
  DEFECT_STATUSES,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  RELEASE_STATUSES,
  REQUIREMENT_STATUS_LABELS,
  REQUIREMENT_STATUSES,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TEST_CASE_STATUSES,
  TEST_CASE_STATUS_LABELS,
} from '../../constants/enums';
import { businessDateKey } from '../../utils/businessDate';

export const AI_ACTION_LABEL_KEYS: Record<string, string> = {
  create_requirement: 'features.ai.aiActionDraftCard.actionCreateRequirement',
  update_requirement: 'features.ai.aiActionDraftCard.actionUpdateRequirement',
  update_requirement_status: 'features.ai.aiActionDraftCard.actionUpdateRequirementStatus',
  delete_requirement: 'features.ai.aiActionDraftCard.actionDeleteRequirement',
  create_defect: 'features.ai.aiActionDraftCard.actionCreateDefect',
  update_defect: 'features.ai.aiActionDraftCard.actionUpdateDefect',
  update_defect_status: 'features.ai.aiActionDraftCard.actionUpdateDefectStatus',
  delete_defect: 'features.ai.aiActionDraftCard.actionDeleteDefect',
  create_task: 'features.ai.aiActionDraftCard.actionCreateTask',
  update_task: 'features.ai.aiActionDraftCard.actionUpdateTask',
  update_task_status: 'features.ai.aiActionDraftCard.actionUpdateTaskStatus',
  delete_task: 'features.ai.aiActionDraftCard.actionDeleteTask',
  create_test_case: 'features.ai.aiActionDraftCard.actionCreateTestCase',
  update_test_case: 'features.ai.aiActionDraftCard.actionUpdateTestCase',
  update_test_case_status: 'features.ai.aiActionDraftCard.actionUpdateTestCaseStatus',
  delete_test_case: 'features.ai.aiActionDraftCard.actionDeleteTestCase',
  create_project: 'features.ai.aiActionDraftCard.actionCreateProject',
  update_project: 'features.ai.aiActionDraftCard.actionUpdateProject',
  update_project_status: 'features.ai.aiActionDraftCard.actionUpdateProjectStatus',
  delete_project: 'features.ai.aiActionDraftCard.actionDeleteProject',
  create_product: 'features.ai.aiActionDraftCard.actionCreateProduct',
  update_product: 'features.ai.aiActionDraftCard.actionUpdateProduct',
  delete_product: 'features.ai.aiActionDraftCard.actionDeleteProduct',
  create_build: 'features.ai.aiActionDraftCard.actionCreateBuild',
  update_build: 'features.ai.aiActionDraftCard.actionUpdateBuild',
  update_build_status: 'features.ai.aiActionDraftCard.actionUpdateBuildStatus',
  delete_build: 'features.ai.aiActionDraftCard.actionDeleteBuild',
  create_release: 'features.ai.aiActionDraftCard.actionCreateRelease',
  update_release_status: 'features.ai.aiActionDraftCard.actionUpdateReleaseStatus',
  delete_release: 'features.ai.aiActionDraftCard.actionDeleteRelease',
  create_document: 'features.ai.aiActionDraftCard.actionCreateDocument',
  update_document: 'features.ai.aiActionDraftCard.actionUpdateDocument',
  delete_document: 'features.ai.aiActionDraftCard.actionDeleteDocument',
  create_sprint: 'features.ai.aiActionDraftCard.actionCreateSprint',
  update_sprint: 'features.ai.aiActionDraftCard.actionUpdateSprint',
  delete_sprint: 'features.ai.aiActionDraftCard.actionDeleteSprint',
  create_work_log: 'features.ai.aiActionDraftCard.actionCreateWorkLog',
  create_time_entry: 'features.ai.aiActionDraftCard.actionCreateTimeEntry',
  create_risk: 'features.ai.aiActionDraftCard.actionCreateRisk',
  create_program: 'features.ai.aiActionDraftCard.actionCreateProgram',
  create_portfolio: 'features.ai.aiActionDraftCard.actionCreatePortfolio',
  create_strategic_goal: 'features.ai.aiActionDraftCard.actionCreateStrategicGoal',
};

export interface AiActionDraft {
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

export type AiActionDraftField = keyof AiActionDraft;

export interface AiActionDraftFormState {
  isCreate: boolean;
  isDelete: boolean;
  isStatus: boolean;
  showTargetId: boolean;
  showTitle: boolean;
  showProject: boolean;
  showReleaseReferences: boolean;
  showStatus: boolean;
  showRequirementDetails: boolean;
  showDefectOrRiskDetails: boolean;
  showTaskDetails: boolean;
  showVersion: boolean;
  showOwner: boolean;
  showObjective: boolean;
  showContent: boolean;
  showTimeEntry: boolean;
  showAssignee: boolean;
  isWorkLog: boolean;
}

export interface AiActionStatusOption {
  value: string;
  labelKey?: string;
}

export function availableAiActionProjects(projects: readonly Project[]): Project[] {
  return projects.filter((item) => !['archived', 'done'].includes(String(item.status || '')));
}

export function aiActionLabelKey(type: string): string | undefined {
  return AI_ACTION_LABEL_KEYS[type];
}

export function createAiActionDraft(
  action: AiProposedAction,
  liveProjects: readonly Project[],
  options: { includeEstimatedHoursFallback?: boolean } = {},
): AiActionDraft {
  const includeEstimatedHoursFallback = options.includeEstimatedHoursFallback === true;
  return {
    title: action.title || action.name || '',
    name: action.title || action.name || '',
    projectId: action.projectId || liveProjects[0]?.id || '',
    productId: action.productId || '',
    resourceId: action.resourceId || '',
    status: action.status || '',
    priority: action.priority || 'medium',
    severity: action.severity || 'medium',
    description: action.description || '',
    content: action.content || action.description || '',
    criteria: (action.acceptanceCriteria || []).join('\n'),
    assignee: action.assignee || action.owner || '',
    assigneeRole: action.assigneeRole || 'dev',
    owner: action.owner || action.assignee || '',
    taskType: action.taskType || 'task',
    estimatedHours: action.estimatedHours != null ? String(action.estimatedHours) : '',
    hours: action.hours != null
      ? String(action.hours)
      : includeEstimatedHoursFallback && action.estimatedHours != null
        ? String(action.estimatedHours)
        : '',
    workDate: action.workDate || businessDateKey(),
    version: action.version || '',
    buildId: action.buildId || '',
    objective: action.objective || '',
    category: action.category || 'project',
    reason: action.reason || '',
  };
}

export function updateAiActionDraftField(
  draft: AiActionDraft,
  field: AiActionDraftField,
  value: string,
): AiActionDraft {
  if (field === 'title') return { ...draft, title: value, name: value };
  return { ...draft, [field]: value };
}

export function updateAiActionDraftObjective(draft: AiActionDraft, value: string): AiActionDraft {
  return { ...draft, objective: value, description: value };
}

export function aiActionDraftFormState(type: string): AiActionDraftFormState {
  const isCreate = type.startsWith('create_');
  const isDelete = type.startsWith('delete_');
  const isStatus = type.includes('_status');
  const isUpdate = type.startsWith('update_');
  const isWorkLog = type.includes('work_log');
  const isRequirement = type.includes('requirement');
  const isDefect = type.includes('defect');
  const isRisk = type.includes('risk');
  const isTask = type.includes('task');
  const isTestCase = type.includes('test_case');
  const isProject = type.includes('project');
  const isProduct = type.includes('product');
  const isProgram = type.includes('program');
  const isPortfolio = type.includes('portfolio');
  const isStrategic = type.includes('strategic');
  const isBuild = type.includes('build');
  const isRelease = type.includes('release');
  const isDocument = type.includes('document');
  const isSprint = type.includes('sprint');
  const isTimeEntry = type.includes('time_entry');

  return {
    isCreate,
    isDelete,
    isStatus,
    showTargetId: !isCreate,
    showTitle: isCreate || (isUpdate && !isStatus) || isWorkLog,
    showProject: isCreate && (
      isRequirement || isDefect || isTask || isTestCase || isBuild || isSprint || isRisk || isTimeEntry || isDocument || isWorkLog
    ),
    showReleaseReferences: isRelease && isCreate,
    showStatus: isStatus || (isSprint && isUpdate),
    showRequirementDetails: isRequirement && (isCreate || type === 'update_requirement'),
    showDefectOrRiskDetails: (isDefect || isRisk) && (isCreate || isUpdate) && !isStatus,
    showTaskDetails: isTask && (isCreate || type === 'update_task'),
    showVersion: (isBuild || isRelease || isProduct) && (isCreate || isUpdate) && !isStatus,
    showOwner: isProject || isProduct || isProgram || isPortfolio || isStrategic || isDocument,
    showObjective: (isProject || isProgram || isPortfolio || isStrategic || isSprint) && (isCreate || isUpdate) && !isStatus,
    showContent: type === 'create_work_log' || type === 'create_document',
    showTimeEntry: type === 'create_time_entry',
    showAssignee: (isCreate || isUpdate) && (isRequirement || isDefect || isTask || isTestCase) && !isStatus,
    isWorkLog,
  };
}

function enumStatusOptions(values: readonly string[], labels: Record<string, string>): AiActionStatusOption[] {
  return values.map((value) => ({ value, labelKey: labels[value] }));
}

export function aiActionStatusOptions(type: string): AiActionStatusOption[] {
  if (type.includes('requirement')) return enumStatusOptions(REQUIREMENT_STATUSES, REQUIREMENT_STATUS_LABELS);
  if (type.includes('defect')) return enumStatusOptions(DEFECT_STATUSES, DEFECT_STATUS_LABELS);
  if (type.includes('test_case')) return enumStatusOptions(TEST_CASE_STATUSES, TEST_CASE_STATUS_LABELS);
  if (type.includes('task')) return enumStatusOptions(TASK_STATUSES, TASK_STATUS_LABELS);
  if (type.includes('project')) return enumStatusOptions(PROJECT_STATUSES, PROJECT_STATUS_LABELS);
  if (type.includes('build')) return BUILD_STATUSES.map((value) => ({ value }));
  if (type.includes('release')) return RELEASE_STATUSES.map((value) => ({ value }));
  return [];
}

export function aiActionIdPlaceholder(type: string): string {
  if (type.includes('requirement')) return 'REQ-xxx';
  if (type.includes('defect')) return 'BUG-xxx';
  if (type.includes('test_case')) return 'TC-xxx';
  if (type.includes('task')) return 'TASK-xxx';
  if (type.includes('project')) return 'PRJ-xxx';
  if (type.includes('product')) return 'PROD-xxx';
  if (type.includes('build')) return 'BLD-xxx';
  if (type.includes('release')) return 'REL-xxx';
  if (type.includes('document')) return 'DOC-xxx';
  if (type.includes('sprint')) return 'SPR-xxx';
  return 'ID';
}
