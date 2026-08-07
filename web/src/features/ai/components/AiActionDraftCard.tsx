import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiProposedAction, Project } from '../../../types';
import {
  BUILD_STATUSES,
  DEFECT_SEVERITIES,
  DEFECT_SEVERITY_LABELS,
  DEFECT_STATUSES,
  DEFECT_STATUS_LABELS,
  PRIORITY_LABELS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  RELEASE_STATUSES,
  REQUIREMENT_PRIORITIES,
  REQUIREMENT_STATUSES,
  REQUIREMENT_STATUS_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_TYPES,
  TASK_TYPE_LABELS,
  TEST_CASE_STATUSES,
  TEST_CASE_STATUS_LABELS,
  labelOf,
} from '../../../constants/enums';
import { ApiError } from '../../../services/api';
import { getSessionUser } from '../../../services/auth';
import { canOperate } from '../../../constants/roles';
import { navigateTo } from '../../team/components/teamMeta';
import { executeAiProposedAction } from '../aiActionExecutor';
import { businessDateKey } from '../../../utils/businessDate';

const ACTION_LABELS: Record<string, string> = {
  create_requirement: 'features.ai.aiActionDraftCard.actionCreateRequirement', update_requirement: 'features.ai.aiActionDraftCard.actionUpdateRequirement', update_requirement_status: 'features.ai.aiActionDraftCard.actionUpdateRequirementStatus', delete_requirement: 'features.ai.aiActionDraftCard.actionDeleteRequirement',
  create_defect: 'features.ai.aiActionDraftCard.actionCreateDefect', update_defect: 'features.ai.aiActionDraftCard.actionUpdateDefect', update_defect_status: 'features.ai.aiActionDraftCard.actionUpdateDefectStatus', delete_defect: 'features.ai.aiActionDraftCard.actionDeleteDefect',
  create_task: 'features.ai.aiActionDraftCard.actionCreateTask', update_task: 'features.ai.aiActionDraftCard.actionUpdateTask', update_task_status: 'features.ai.aiActionDraftCard.actionUpdateTaskStatus', delete_task: 'features.ai.aiActionDraftCard.actionDeleteTask',
  create_test_case: 'features.ai.aiActionDraftCard.actionCreateTestCase', update_test_case: 'features.ai.aiActionDraftCard.actionUpdateTestCase', update_test_case_status: 'features.ai.aiActionDraftCard.actionUpdateTestCaseStatus', delete_test_case: 'features.ai.aiActionDraftCard.actionDeleteTestCase',
  create_project: 'features.ai.aiActionDraftCard.actionCreateProject', update_project: 'features.ai.aiActionDraftCard.actionUpdateProject', update_project_status: 'features.ai.aiActionDraftCard.actionUpdateProjectStatus', delete_project: 'features.ai.aiActionDraftCard.actionDeleteProject',
  create_product: 'features.ai.aiActionDraftCard.actionCreateProduct', update_product: 'features.ai.aiActionDraftCard.actionUpdateProduct', delete_product: 'features.ai.aiActionDraftCard.actionDeleteProduct',
  create_build: 'features.ai.aiActionDraftCard.actionCreateBuild', update_build: 'features.ai.aiActionDraftCard.actionUpdateBuild', update_build_status: 'features.ai.aiActionDraftCard.actionUpdateBuildStatus', delete_build: 'features.ai.aiActionDraftCard.actionDeleteBuild',
  create_release: 'features.ai.aiActionDraftCard.actionCreateRelease', update_release_status: 'features.ai.aiActionDraftCard.actionUpdateReleaseStatus', delete_release: 'features.ai.aiActionDraftCard.actionDeleteRelease',
  create_document: 'features.ai.aiActionDraftCard.actionCreateDocument', update_document: 'features.ai.aiActionDraftCard.actionUpdateDocument', delete_document: 'features.ai.aiActionDraftCard.actionDeleteDocument',
  create_sprint: 'features.ai.aiActionDraftCard.actionCreateSprint', update_sprint: 'features.ai.aiActionDraftCard.actionUpdateSprint', delete_sprint: 'features.ai.aiActionDraftCard.actionDeleteSprint',
  create_work_log: 'features.ai.aiActionDraftCard.actionCreateWorkLog', create_time_entry: 'features.ai.aiActionDraftCard.actionCreateTimeEntry',
  create_risk: 'features.ai.aiActionDraftCard.actionCreateRisk', create_program: 'features.ai.aiActionDraftCard.actionCreateProgram', create_portfolio: 'features.ai.aiActionDraftCard.actionCreatePortfolio', create_strategic_goal: 'features.ai.aiActionDraftCard.actionCreateStrategicGoal',
};

function kindOf(type: string) {
  if (type.includes('requirement')) return 'requirement';
  if (type.includes('defect')) return 'defect';
  if (type.includes('test_case')) return 'test_case';
  if (type.includes('task')) return 'task';
  if (type.includes('project')) return 'project';
  if (type.includes('product') || type.includes('program') || type.includes('portfolio') || type.includes('strategic')) return 'product';
  if (type.includes('build') || type.includes('release')) return 'delivery';
  if (type.includes('document')) return 'document';
  if (type.includes('sprint')) return 'sprint';
  if (type.includes('work_log') || type.includes('time_entry')) return 'personal';
  if (type.includes('risk')) return 'risk';
  return 'other';
}

function canWriteType(type: string) {
  const user = getSessionUser();
  const kind = kindOf(type);
  if (kind === 'requirement') return canOperate(user, 'requirements:manage');
  if (kind === 'defect' || kind === 'test_case') return canOperate(user, 'testing:manage');
  if (kind === 'task' || kind === 'project' || kind === 'sprint' || kind === 'risk') return canOperate(user, 'projects:manage');
  if (kind === 'product') return canOperate(user, 'products:manage');
  if (kind === 'delivery') return canOperate(user, 'delivery:manage') || canOperate(user, 'projects:manage');
  if (kind === 'document') return canOperate(user, 'documents:manage');
  if (kind === 'personal') return true;
  return canOperate(user, 'projects:manage');
}

function idPlaceholder(type: string) {
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

function openResult(type: string, id: string, projectId?: string) {
  if (type.includes('requirement')) navigateTo('requirements', { focus: id });
  else if (type.includes('defect') || type.includes('test_case')) navigateTo('testing', { tab: type.includes('defect') ? 'defects' : 'cases', focus: id });
  else if (type.includes('task') || type.includes('sprint') || type.includes('project') || type.includes('risk')) navigateTo('projects', projectId ? { focus: projectId } : { focus: id });
  else if (type.includes('product') || type.includes('program') || type.includes('portfolio') || type.includes('strategic')) navigateTo('products');
  else if (type.includes('build') || type.includes('release')) navigateTo('delivery', { focus: id });
  else if (type.includes('document')) navigateTo('documents', { focus: id });
  else if (type.includes('work_log') || type.includes('time_entry')) navigateTo('mywork');
}

export default function AiActionDraftCard({
  action,
  projects,
  onDone,
}: {
  action: AiProposedAction;
  projects: Project[];
  onDone?: (result: { type: string; id: string; label: string }) => void;
}) {
  const { t } = useTranslation();
  const liveProjects = useMemo(
    () => projects.filter((item) => !['archived', 'done'].includes(String(item.status || ''))),
    [projects],
  );
  const type = String(action.type);
  const label = ACTION_LABELS[type] ? t(ACTION_LABELS[type]) : type;
  const canWrite = canWriteType(type);
  const isCreate = type.startsWith('create_');
  const isDelete = type.startsWith('delete_');
  const isStatus = type.includes('_status');

  const [title, setTitle] = useState(action.title || action.name || '');
  const [projectId, setProjectId] = useState(action.projectId || liveProjects[0]?.id || '');
  const [productId, setProductId] = useState(action.productId || '');
  const [resourceId, setResourceId] = useState(action.resourceId || '');
  const [status, setStatus] = useState(action.status || '');
  const [priority, setPriority] = useState(action.priority || 'medium');
  const [severity, setSeverity] = useState(action.severity || 'medium');
  const [description, setDescription] = useState(action.description || '');
  const [content, setContent] = useState(action.content || action.description || '');
  const [criteria, setCriteria] = useState((action.acceptanceCriteria || []).join('\n'));
  const [assignee, setAssignee] = useState(action.assignee || action.owner || '');
  const [assigneeRole, setAssigneeRole] = useState(action.assigneeRole || 'dev');
  const [owner, setOwner] = useState(action.owner || action.assignee || '');
  const [taskType, setTaskType] = useState(action.taskType || 'task');
  const [estimatedHours, setEstimatedHours] = useState(action.estimatedHours != null ? String(action.estimatedHours) : '');
  const [hours, setHours] = useState(action.hours != null ? String(action.hours) : action.estimatedHours != null ? String(action.estimatedHours) : '');
  const [workDate, setWorkDate] = useState(action.workDate || businessDateKey());
  const [version, setVersion] = useState(action.version || '');
  const [buildId, setBuildId] = useState(action.buildId || '');
  const [objective, setObjective] = useState(action.objective || '');
  const [category, setCategory] = useState(action.category || 'project');
  const [reason, setReason] = useState(action.reason || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);

  useEffect(() => {
    setTitle(action.title || action.name || '');
    setProjectId(action.projectId || liveProjects[0]?.id || '');
    setProductId(action.productId || '');
    setResourceId(action.resourceId || '');
    setStatus(action.status || '');
    setPriority(action.priority || 'medium');
    setSeverity(action.severity || 'medium');
    setDescription(action.description || '');
    setContent(action.content || action.description || '');
    setCriteria((action.acceptanceCriteria || []).join('\n'));
    setAssignee(action.assignee || action.owner || '');
    setAssigneeRole(action.assigneeRole || 'dev');
    setOwner(action.owner || action.assignee || '');
    setTaskType(action.taskType || 'task');
    setEstimatedHours(action.estimatedHours != null ? String(action.estimatedHours) : '');
    setHours(action.hours != null ? String(action.hours) : '');
    setWorkDate(action.workDate || businessDateKey());
    setVersion(action.version || '');
    setBuildId(action.buildId || '');
    setObjective(action.objective || '');
    setCategory(action.category || 'project');
    setReason(action.reason || '');
    setDoneId(null);
    setError(null);
  }, [action, liveProjects]);

  const statusOptions = useMemo(() => {
    if (type.includes('requirement')) return REQUIREMENT_STATUSES.map((s) => ({ value: s, label: labelOf(REQUIREMENT_STATUS_LABELS, s) }));
    if (type.includes('defect')) return DEFECT_STATUSES.map((s) => ({ value: s, label: labelOf(DEFECT_STATUS_LABELS, s) }));
    if (type.includes('test_case')) return TEST_CASE_STATUSES.map((s) => ({ value: s, label: labelOf(TEST_CASE_STATUS_LABELS, s) }));
    if (type.includes('task')) return TASK_STATUSES.map((s) => ({ value: s, label: labelOf(TASK_STATUS_LABELS, s) }));
    if (type.includes('project')) return PROJECT_STATUSES.map((s) => ({ value: s, label: labelOf(PROJECT_STATUS_LABELS, s) }));
    if (type.includes('build')) return BUILD_STATUSES.map((s) => ({ value: s, label: s }));
    if (type.includes('release')) return RELEASE_STATUSES.map((s) => ({ value: s, label: s }));
    return [];
  }, [type]);

  async function handleExecute() {
    if (!canWrite) {
      setError(t('features.ai.aiActionDraftCard.noWritePermission'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await executeAiProposedAction(action, {
        title, name: title, projectId, productId, resourceId, status, priority, severity,
        description, content, criteria, assignee, assigneeRole, owner, taskType,
        estimatedHours, hours, workDate, version, buildId, objective, category, reason,
      });
      setDoneId(result.id);
      onDone?.({ type: result.type, id: result.id, label });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : t('features.ai.aiActionDraftCard.operationFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  if (doneId) {
    return (
      <div className="ai-action-card ai-action-card-success">
        <div className="ai-action-card-title">{t('features.ai.aiActionDraftCard.completed', { label })}</div>
        <div className="body-text">{t('features.ai.aiActionDraftCard.target')}：<span className="text-mono">{doneId}</span></div>
        <div className="ai-action-card-toolbar">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openResult(type, doneId, projectId)}>{t('features.ai.aiActionDraftCard.openRelatedPage')}</button>
        </div>
      </div>
    );
  }

  const showProject = isCreate && (type.includes('requirement') || type.includes('defect') || type.includes('task') || type.includes('test_case') || type.includes('build') || type.includes('sprint') || type.includes('risk') || type.includes('time_entry') || type.includes('document') || type.includes('work_log'));
  const showTitle = isCreate || (type.startsWith('update_') && !isStatus) || type.includes('work_log');
  const showOwner = type.includes('project') || type.includes('product') || type.includes('program') || type.includes('portfolio') || type.includes('strategic') || type.includes('document');

  return (
    <div className={`ai-action-card ${isDelete ? 'ai-action-card-danger' : ''}`}>
      <div className="ai-action-card-title">{t('features.ai.aiActionDraftCard.confirmTitle', { label })}</div>
      <div className="text-secondary" style={{ fontSize: 12, marginBottom: 8 }}>
        {t('features.ai.aiActionDraftCard.draftOnlyHint')}
      </div>
      {error ? <div className="form-error" style={{ marginBottom: 8 }}>{error}</div> : null}

      {!isCreate ? (
        <div className="form-group">
          <label className="form-label">{t('features.ai.aiActionDraftCard.targetId')}</label>
          <input className="form-input" value={resourceId} onChange={(e) => setResourceId(e.target.value)} placeholder={idPlaceholder(type)} disabled={!canWrite || submitting} />
        </div>
      ) : null}

      {showTitle ? (
        <div className="form-group">
          <label className="form-label">{type.includes('work_log') ? t('features.ai.aiActionDraftCard.summaryOrTitle') : t('features.ai.aiActionDraftCard.titleOrName')}</label>
          <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canWrite || submitting} />
        </div>
      ) : null}

      {showProject ? (
        <div className="form-group">
          <label className="form-label">{t('features.ai.aiActionDraftCard.project')}</label>
          <select className="form-select" value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!canWrite || submitting}>
            <option value="">{t('features.ai.aiActionDraftCard.selectProject')}</option>
            {liveProjects.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.id})</option>)}
          </select>
        </div>
      ) : null}

      {type.includes('release') && isCreate ? (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.productIdOptional')}</label>
            <input className="form-input" value={productId} onChange={(e) => setProductId(e.target.value)} disabled={!canWrite || submitting} placeholder="PROD-xxx" />
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.buildIdOptional')}</label>
            <input className="form-input" value={buildId} onChange={(e) => setBuildId(e.target.value)} disabled={!canWrite || submitting} placeholder="BLD-xxx" />
          </div>
        </div>
      ) : null}

      {isStatus || (type.includes('sprint') && type.startsWith('update_')) ? (
        <div className="form-group">
          <label className="form-label">{t('features.ai.aiActionDraftCard.targetStatus')}</label>
          {statusOptions.length ? (
            <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)} disabled={!canWrite || submitting}>
              <option value="">{t('features.ai.aiActionDraftCard.selectPlaceholder')}</option>
              {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          ) : (
            <input className="form-input" value={status} onChange={(e) => setStatus(e.target.value)} disabled={!canWrite || submitting} />
          )}
        </div>
      ) : null}

      {type.includes('requirement') && (isCreate || type === 'update_requirement') ? (
        <>
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.priority')}</label>
            <select className="form-select" value={priority} onChange={(e) => setPriority(e.target.value)} disabled={!canWrite || submitting}>
              {REQUIREMENT_PRIORITIES.map((item) => <option key={item} value={item}>{labelOf(PRIORITY_LABELS, item)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.description')}</label>
            <textarea className="form-textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canWrite || submitting} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.acceptanceCriteriaOnePerLine')}</label>
            <textarea className="form-textarea" rows={2} value={criteria} onChange={(e) => setCriteria(e.target.value)} disabled={!canWrite || submitting} />
          </div>
        </>
      ) : null}

      {(type.includes('defect') || type.includes('risk')) && (isCreate || type.startsWith('update_')) && !isStatus ? (
        <>
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.severity')}</label>
            <select className="form-select" value={severity} onChange={(e) => setSeverity(e.target.value)} disabled={!canWrite || submitting}>
              {DEFECT_SEVERITIES.map((item) => <option key={item} value={item}>{labelOf(DEFECT_SEVERITY_LABELS, item)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.description')}</label>
            <textarea className="form-textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canWrite || submitting} />
          </div>
        </>
      ) : null}

      {type.includes('task') && (isCreate || type === 'update_task') ? (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.taskType')}</label>
            <select className="form-select" value={taskType} onChange={(e) => setTaskType(e.target.value)} disabled={!canWrite || submitting}>
              {TASK_TYPES.map((item) => <option key={item} value={item}>{labelOf(TASK_TYPE_LABELS, item)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.estimatedHours')}</label>
            <input className="form-input" value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} disabled={!canWrite || submitting} />
          </div>
        </div>
      ) : null}

      {(type.includes('build') || type.includes('release') || type.includes('product')) && (isCreate || type.startsWith('update_')) && !isStatus ? (
        <div className="form-group">
          <label className="form-label">{t('features.ai.aiActionDraftCard.version')}</label>
          <input className="form-input" value={version} onChange={(e) => setVersion(e.target.value)} disabled={!canWrite || submitting} placeholder="1.0.0" />
        </div>
      ) : null}

      {showOwner ? (
        <div className="form-group">
          <label className="form-label">{t('features.ai.aiActionDraftCard.owner')}</label>
          <input className="form-input" value={owner} onChange={(e) => setOwner(e.target.value)} disabled={!canWrite || submitting} />
        </div>
      ) : null}

      {(type.includes('project') || type.includes('program') || type.includes('portfolio') || type.includes('strategic') || type.includes('sprint')) && (isCreate || type.startsWith('update_')) && !isStatus ? (
        <div className="form-group">
          <label className="form-label">{t('features.ai.aiActionDraftCard.objectiveOrNotes')}</label>
          <textarea className="form-textarea" rows={2} value={objective || description} onChange={(e) => { setObjective(e.target.value); setDescription(e.target.value); }} disabled={!canWrite || submitting} />
        </div>
      ) : null}

      {type === 'create_work_log' || type === 'create_document' ? (
        <div className="form-group">
          <label className="form-label">{type === 'create_work_log' ? t('features.ai.aiActionDraftCard.workLogContent') : t('features.ai.aiActionDraftCard.documentBody')}</label>
          <textarea className="form-textarea" rows={4} value={content} onChange={(e) => setContent(e.target.value)} disabled={!canWrite || submitting} />
        </div>
      ) : null}

      {type === 'create_time_entry' ? (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.hours')}</label>
            <input className="form-input" value={hours} onChange={(e) => setHours(e.target.value)} disabled={!canWrite || submitting} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.date')}</label>
            <input className="form-input" type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} disabled={!canWrite || submitting} />
          </div>
        </div>
      ) : null}

      {(isCreate || type.startsWith('update_')) && (type.includes('requirement') || type.includes('defect') || type.includes('task') || type.includes('test_case')) && !isStatus ? (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('features.ai.aiActionDraftCard.assignee')}</label>
            <input className="form-input" value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={!canWrite || submitting} />
          </div>
          {!type.includes('task') ? (
            <div className="form-group">
              <label className="form-label">{t('features.ai.aiActionDraftCard.role')}</label>
              <select className="form-select" value={assigneeRole} onChange={(e) => setAssigneeRole(e.target.value)} disabled={!canWrite || submitting || !assignee.trim()}>
                <option value="dev">{t('features.ai.aiActionDraftCard.roleDev')}</option>
                <option value="qa">{t('features.ai.aiActionDraftCard.roleQa')}</option>
              </select>
            </div>
          ) : <div />}
        </div>
      ) : null}

      {isDelete ? <div className="text-secondary" style={{ fontSize: 12, marginBottom: 8 }}>{t('features.ai.aiActionDraftCard.deleteIrreversibleHint')}</div> : null}

      <div className="ai-action-card-toolbar">
        <button type="button" className={`btn btn-sm ${isDelete ? 'btn-danger' : 'btn-primary'}`} onClick={() => { void handleExecute(); }} disabled={!canWrite || submitting}>
          {submitting ? t('features.ai.aiActionDraftCard.executing') : isDelete ? t('features.ai.aiActionDraftCard.confirmDelete') : t('features.ai.aiActionDraftCard.confirmExecute')}
        </button>
        {!canWrite ? <span className="text-secondary" style={{ fontSize: 12 }}>{t('features.ai.aiActionDraftCard.roleNoWritePermission')}</span> : null}
      </div>
    </div>
  );
}
