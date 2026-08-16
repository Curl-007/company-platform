import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, X } from 'lucide-react';
import {
  createTestCase,
  updateTestCase,
  type CreateTestCaseInput,
  type UpdateTestCaseInput,
} from '../api';
import { fetchProjects } from '../../projects/api';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import BusinessAdvicePanel from '../../../components/common/BusinessAdvicePanel';
import type { Project, TestCase } from '../../../types';
import {
  TEST_CASE_STATUS_LABELS,
  labelOf,
} from '../../../constants/enums';

export default function TestCaseForm({
  mode,
  item,
  onClose,
  onDone,
  canUseAi = false,
}: {
  mode: 'create' | 'edit';
  item?: TestCase | null;
  onClose: () => void;
  onDone: () => void;
  canUseAi?: boolean;
}) {
  const { t } = useTranslation();
  const { data: projects } = useAsync<Project[]>(fetchProjects, [], { cacheKey: 'projects:list' });
  const [name, setName] = useState(item?.name ?? '');
  const [projectId, setProjectId] = useState(item?.projectId ?? '');
  const [owner, setOwner] = useState(item?.owner ?? '');
  const [assigneeRole, setAssigneeRole] = useState(item?.assigneeRole ?? 'qa');
  const [description, setDescription] = useState(item?.description ?? '');
  const [expectedResult, setExpectedResult] = useState(item?.expectedResult ?? '');
  const [stepsText, setStepsText] = useState((item?.steps ?? []).join('\n'));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim()) return setFormError(t('features.testing.testCaseForm.nameRequired'));
    if (!projectId) return setFormError(t('features.testing.testCaseForm.projectRequired'));
    setFormError(null);
    setSubmitting(true);
    try {
      const payload: CreateTestCaseInput & UpdateTestCaseInput = {
        name: name.trim(),
        projectId,
        owner: owner.trim() || undefined,
        assigneeRole,
        description: description.trim() || undefined,
        expectedResult: expectedResult.trim() || undefined,
        steps: stepsText.split('\n').map((line) => line.trim()).filter(Boolean),
      };
      if (mode === 'create') await createTestCase(payload);
      else if (item) await updateTestCase(item.id, payload);
      onDone();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : (mode === 'create' ? t('features.testing.testCaseForm.createFailed') : t('features.testing.testCaseForm.updateFailed')));
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={720} ariaLabel={mode === 'create' ? t('features.testing.testCaseForm.createTitle') : t('features.testing.testCaseForm.editTitle')}>
      <Panel
        className="qa-form-panel"
        title={mode === 'create' ? t('features.testing.testCaseForm.createTitle') : t('features.testing.testCaseForm.editTitle')}
        subtitle={item?.id ?? t('features.testing.testCaseForm.subtitle')}
        toolbar={(
          <button className="btn btn-text btn-sm btn-with-icon" onClick={onClose} aria-label={t('common.close')}>
            <X size={15} aria-hidden="true" />
          </button>
        )}
      >
        <div className="qa-form-body">
          {formError ? <div className="form-error qa-form-error">{formError}</div> : null}

          {canUseAi && item ? (
            <BusinessAdvicePanel
              targetType="test_case"
              targetId={item.id}
              title={t('features.testing.testCaseForm.aiAdviceTitle')}
              description={t('features.testing.testCaseForm.aiAdviceDesc')}
              buttonText={t('features.testing.testCaseForm.aiAnalyzeCase')}
              question={t('features.testing.testCaseForm.aiAdviceQuestion')}
              draft={() => ({
                name: name.trim(),
                projectId,
                owner: owner.trim(),
                assigneeRole,
                steps: stepsText.split('\n').map((line) => line.trim()).filter(Boolean),
                expectedResult: expectedResult.trim(),
                description: description.trim(),
              })}
            />
          ) : null}

          {mode === 'edit' && item ? (
            <div className="qa-form-summary">
              <StatusBadge status={item.status} label={labelOf(TEST_CASE_STATUS_LABELS, item.status)} />
              <span className="qa-form-summary-meta">
                {t('features.testing.testCaseForm.summaryMeta', { total: item.totalCases, passed: item.passedCases, failed: item.failedCases, blocked: item.blockedCases })}
              </span>
            </div>
          ) : null}

          <div className="qa-form-section">{t('features.testing.testCaseForm.sectionBasic')}</div>
          <div className="form-group">
            <label className="form-label">{t('features.testing.testCaseForm.nameLabel')}</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('features.testing.testCaseForm.namePlaceholder')} />
          </div>

          <div className="qa-form-grid">
            <div className="form-group">
              <label className="form-label">{t('features.testing.testCaseForm.projectLabel')}</label>
              <select className="form-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">{t('features.testing.testCaseForm.selectProject')}</option>
                {(projects ?? []).map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.testing.testCaseForm.ownerLabel')}</label>
              <input className="form-input" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder={t('features.testing.testCaseForm.ownerPlaceholder')} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.testing.testCaseForm.assigneeRoleLabel')}</label>
              <select className="form-select" value={assigneeRole} onChange={(e) => setAssigneeRole(e.target.value)}>
                <option value="qa">{t('features.testing.testCaseForm.roleQa')}</option>
                <option value="dev">{t('features.testing.testCaseForm.roleDev')}</option>
              </select>
            </div>
            {mode === 'edit' && item ? (
              <div className="form-group">
                <label className="form-label">{t('features.testing.testCaseForm.currentStatusLabel')}</label>
                <div className="qa-form-status">
                  <StatusBadge status={item.status} label={labelOf(TEST_CASE_STATUS_LABELS, item.status)} />
                </div>
              </div>
            ) : (
              <div className="form-group qa-form-spacer" aria-hidden="true" />
            )}
          </div>

          <div className="qa-form-section">{t('features.testing.testCaseForm.sectionExecution')}</div>
          <div className="form-group">
            <label className="form-label">{t('features.testing.testCaseForm.stepsLabel')}</label>
            <textarea
              className="form-textarea"
              rows={5}
              value={stepsText}
              onChange={(e) => setStepsText(e.target.value)}
              placeholder={t('features.testing.testCaseForm.stepsPlaceholder')}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.testing.testCaseForm.expectedResultLabel')}</label>
            <textarea
              className="form-textarea"
              rows={3}
              value={expectedResult}
              onChange={(e) => setExpectedResult(e.target.value)}
              placeholder={t('features.testing.testCaseForm.expectedResultPlaceholder')}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.testing.testCaseForm.descriptionLabel')}</label>
            <textarea
              className="form-textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('features.testing.testCaseForm.descriptionPlaceholder')}
            />
          </div>

          <div className="qa-form-footer">
            <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>{t('common.cancel')}</button>
            <button className="btn btn-primary btn-sm btn-with-icon" onClick={handleSubmit} disabled={submitting}>
              <Save size={14} aria-hidden="true" />
              {submitting ? t('features.testing.testCaseForm.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </Panel>
    </Overlay>
  );
}
