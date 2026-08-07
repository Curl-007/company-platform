import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2 } from 'lucide-react';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useToast } from '../../../components/common/Toast';
import { Button, FormField, SelectInput, TextArea, TextInput } from '../../../components/ui';
import { ApiError } from '../../../services/api';
import type { OrganizationUnit, TeamMemberOverview } from '../../../types';
import { createDepartment, deleteDepartment, updateDepartment } from '../api';
import { ROLE_LABELS, statusLabel } from './teamMeta';

export default function DepartmentDirectoryDialog({
  departments,
  members,
  onClose,
  onChanged,
}: {
  departments: OrganizationUnit[];
  members: TeamMemberOverview[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', parentId: '', managerUserId: '', responsibilities: '', status: 'active' as 'active' | 'archived' });
  const [submitting, setSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  function focusNameInput() {
    window.requestAnimationFrame(() => {
      const input = nameInputRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      input.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  function setField(key: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setEditingId(null);
    setDraft({ name: '', parentId: '', managerUserId: '', responsibilities: '', status: 'active' });
    focusNameInput();
  }

  function editDepartment(item: OrganizationUnit) {
    setEditingId(item.id);
    setDraft({
      name: item.name,
      parentId: item.parentId ?? '',
      managerUserId: item.managerUserId ?? '',
      responsibilities: item.responsibilities,
      status: item.status === 'archived' ? 'archived' : 'active',
    });
    focusNameInput();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    setSubmitting(true);
    try {
      const payload = {
        name: draft.name.trim(),
        parentId: draft.parentId || null,
        managerUserId: draft.managerUserId || null,
        responsibilities: draft.responsibilities.trim(),
        status: draft.status,
      };
      if (editingId) await updateDepartment(editingId, payload);
      else await createDepartment(payload);
      toast.success(editingId ? t('features.team.departmentDirectoryDialog.departmentUpdated') : t('features.team.departmentDirectoryDialog.departmentCreated'));
      await onChanged();
      reset();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : t('features.team.departmentDirectoryDialog.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function removeDepartment(item: OrganizationUnit) {
    const approved = await confirm({
      title: t('features.team.departmentDirectoryDialog.deleteConfirm', { name: item.name }),
      description: t('features.team.departmentDirectoryDialog.deleteDesc'),
      confirmText: t('features.team.departmentDirectoryDialog.deleteDepartment'),
      tone: 'danger',
    });
    if (!approved) return;
    try {
      await deleteDepartment(item.id);
      toast.success(t('features.team.departmentDirectoryDialog.departmentDeleted'));
      await onChanged();
      if (editingId === item.id) reset();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : t('features.team.departmentDirectoryDialog.deleteFailed'));
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={980} ariaLabel={t('features.team.departmentDirectoryDialog.title')}>
      <Panel
        title={t('features.team.departmentDirectoryDialog.title')}
        subtitle={t('features.team.departmentDirectoryDialog.subtitle')}
      >
        <div className="team-detail-grid">
          <section className="team-detail-section">
            <div className="team-section-title">{editingId ? t('features.team.departmentDirectoryDialog.editDepartment') : t('features.team.departmentDirectoryDialog.newDepartment')}</div>
            <form className="form-stack" onSubmit={submit}>
              <FormField label={t('features.team.departmentDirectoryDialog.nameLabel')} htmlFor="department-name" required>
                <TextInput ref={nameInputRef} id="department-name" value={draft.name} onChange={(event) => setField('name', event.target.value)} required />
              </FormField>
              <FormField label={t('features.team.departmentDirectoryDialog.parentLabel')} htmlFor="department-parent">
                <SelectInput id="department-parent" value={draft.parentId} onChange={(event) => setField('parentId', event.target.value)}>
                  <option value="">{t('features.team.departmentDirectoryDialog.noParent')}</option>
                  {departments.filter((item) => item.id !== editingId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </SelectInput>
              </FormField>
              <FormField label={t('features.team.departmentDirectoryDialog.managerLabel')} htmlFor="department-manager">
                <SelectInput id="department-manager" value={draft.managerUserId} onChange={(event) => setField('managerUserId', event.target.value)}>
                  <option value="">{t('features.team.departmentDirectoryDialog.notSpecified')}</option>
                  {members.filter((item) => item.status !== 'disabled').map((item) => <option key={item.id} value={item.id}>{item.name} · {statusLabel(ROLE_LABELS, item.role)}</option>)}
                </SelectInput>
              </FormField>
              <FormField label={t('features.team.departmentDirectoryDialog.responsibilitiesLabel')} htmlFor="department-responsibilities">
                <TextArea id="department-responsibilities" rows={3} value={draft.responsibilities} onChange={(event) => setField('responsibilities', event.target.value)} />
              </FormField>
              {editingId ? <FormField label={t('features.team.departmentDirectoryDialog.statusLabel')} htmlFor="department-status"><SelectInput id="department-status" value={draft.status} onChange={(event) => setField('status', event.target.value)}><option value="active">{t('features.team.departmentDirectoryDialog.active')}</option><option value="archived">{t('features.team.departmentDirectoryDialog.archived')}</option></SelectInput></FormField> : null}
              <div className="department-form-actions">
                {editingId ? <Button variant="secondary" size="sm" onClick={reset} disabled={submitting}>{t('features.team.departmentDirectoryDialog.cancelEdit')}</Button> : null}
                <Button type="submit" variant="primary" size="sm" disabled={submitting}>{submitting ? t('features.team.departmentDirectoryDialog.saving') : editingId ? t('features.team.departmentDirectoryDialog.saveDepartment') : t('features.team.departmentDirectoryDialog.createDepartment')}</Button>
              </div>
            </form>
          </section>
          <section className="team-detail-section">
            <div className="team-section-title">{t('features.team.departmentDirectoryDialog.registeredDepartments')}</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {departments.length === 0 ? <div className="team-empty-line">{t('features.team.departmentDirectoryDialog.noDepartments')}</div> : departments.map((item) => (
                <div key={item.id} className="team-link-row" style={{ cursor: 'default' }}>
                  <div>
                    <strong>{item.name}</strong>
                    <div className="team-task-meta">{t('features.team.departmentDirectoryDialog.memberCount', { count: item.memberCount, status: item.status === 'archived' ? t('features.team.departmentDirectoryDialog.archived') : t('features.team.departmentDirectoryDialog.active') })}</div>
                    {item.responsibilities ? <div className="team-task-meta">{item.responsibilities}</div> : null}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" icon={<Pencil size={14} />} onClick={() => editDepartment(item)}>{t('common.edit')}</Button>
                    <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => removeDepartment(item)} disabled={item.memberCount > 0}>{t('common.delete')}</Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
        <div className="team-detail-actions"><Button variant="secondary" size="sm" onClick={onClose}>{t('common.close')}</Button></div>
      </Panel>
    </Overlay>
  );
}
