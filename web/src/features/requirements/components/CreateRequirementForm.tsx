import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import { PRIORITY_LABELS, REQUIREMENT_PRIORITIES, labelOf } from '../../../constants/enums';
import { ApiError } from '../../../services/api';
import { createIdempotencyKey } from '../../../services/idempotency';
import type { Project, Requirement } from '../../../types';
import { createRequirement } from '../api';

const EXEC_ROLE_OPTIONS = [
  { value: 'dev', label: 'features.requirements.createRequirementForm.roleDev' },
  { value: 'qa', label: 'features.requirements.createRequirementForm.roleQa' },
];

interface CreateRequirementFormProps {
  projects: Project[];
  requirements: Requirement[];
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateRequirementForm({
  projects,
  requirements,
  onClose,
  onCreated,
}: CreateRequirementFormProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [parentId, setParentId] = useState('');
  const [owner, setOwner] = useState('');
  const [assignee, setAssignee] = useState('');
  const [assigneeRole, setAssigneeRole] = useState('dev');
  const [priority, setPriority] = useState('medium');
  const [description, setDescription] = useState('');
  const [criteria, setCriteria] = useState('');
  const createRequest = useRef<{ key: string; payload: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const parentOptions = requirements.filter((item) => !item.parentId && item.projectId === projectId);

  async function handleSubmit() {
    if (!title.trim()) return setFormError(t('features.requirements.createRequirementForm.titleRequired'));
    if (!projectId) return setFormError(t('features.requirements.createRequirementForm.projectRequired'));
    setFormError(null);
    setSubmitting(true);
    try {
      const input = {
        title: title.trim(),
        projectId,
        parentId: parentId || undefined,
        owner: owner.trim() || undefined,
        assignee: assignee.trim() || undefined,
        assigneeRole: assignee.trim() ? assigneeRole : undefined,
        priority,
        description: description.trim() || undefined,
        acceptanceCriteria: criteria.split('\n').map((item) => item.trim()).filter(Boolean),
      };
      const payload = JSON.stringify(input);
      if (!createRequest.current || createRequest.current.payload !== payload) {
        createRequest.current = { key: createIdempotencyKey('requirement-create'), payload };
      }
      await createRequirement(input, createRequest.current.key);
      onCreated();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : t('features.requirements.createRequirementForm.createFailed'));
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={680} ariaLabel={t('features.requirements.createRequirementForm.ariaLabel')}>
      <Panel
        className="req-create-panel"
        title={t('features.requirements.createRequirementForm.title')}
        subtitle={t('features.requirements.createRequirementForm.subtitle')}
        toolbar={(
          <button className="btn btn-text btn-sm btn-with-icon" onClick={onClose} aria-label={t('common.close')}>
            <X size={15} aria-hidden="true" />
          </button>
        )}
      >
        <div className="req-create-body">
          {formError ? <div className="form-error req-detail-error">{formError}</div> : null}

          <div className="form-group">
            <label className="form-label">{t('features.requirements.createRequirementForm.titleLabel')}</label>
            <input
              className="form-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('features.requirements.createRequirementForm.titlePlaceholder')}
              autoFocus
            />
          </div>

          <div className="req-form-grid">
            <div className="form-group">
              <label className="form-label">{t('features.requirements.createRequirementForm.projectLabel')}</label>
              <select
                className="form-select"
                value={projectId}
                onChange={(event) => {
                  setProjectId(event.target.value);
                  setParentId('');
                }}
              >
                <option value="">{t('features.requirements.createRequirementForm.selectProject')}</option>
                {projects.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.requirements.createRequirementForm.priorityLabel')}</label>
              <select
                className="form-select"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                {REQUIREMENT_PRIORITIES.map((item) => (
                  <option key={item} value={item}>{labelOf(PRIORITY_LABELS, item)}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.requirements.createRequirementForm.ownerLabel')}</label>
              <input
                className="form-input"
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
                placeholder={t('features.requirements.createRequirementForm.ownerPlaceholder')}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.requirements.createRequirementForm.parentLabel')}</label>
              <select
                className="form-select"
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
                <option value="">{t('features.requirements.createRequirementForm.noParent')}</option>
                {parentOptions.map((item) => (
                  <option key={item.id} value={item.id}>{item.id} · {item.title}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.requirements.createRequirementForm.assigneeLabel')}</label>
              <input
                className="form-input"
                value={assignee}
                onChange={(event) => setAssignee(event.target.value)}
                placeholder={t('features.requirements.createRequirementForm.assigneePlaceholder')}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.requirements.createRequirementForm.assigneeRoleLabel')}</label>
              <select
                className="form-select"
                value={assigneeRole}
                onChange={(event) => setAssigneeRole(event.target.value)}
              >
                {EXEC_ROLE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{t(item.label)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{t('features.requirements.createRequirementForm.descriptionLabel')}</label>
            <textarea
              className="form-textarea"
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('features.requirements.createRequirementForm.descriptionPlaceholder')}
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t('features.requirements.createRequirementForm.criteriaLabel')}</label>
            <textarea
              className="form-textarea"
              rows={4}
              value={criteria}
              onChange={(event) => setCriteria(event.target.value)}
              placeholder={t('features.requirements.createRequirementForm.criteriaPlaceholder')}
            />
          </div>

          <div className="req-detail-footer">
            <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>
              {t('common.cancel')}
            </button>
            <button
              className="btn btn-primary btn-sm btn-with-icon"
              onClick={handleSubmit}
              disabled={submitting}
            >
              <Plus size={14} aria-hidden="true" />
              {submitting ? t('features.requirements.createRequirementForm.creating') : t('features.requirements.createRequirementForm.create')}
            </button>
          </div>
        </div>
      </Panel>
    </Overlay>
  );
}
