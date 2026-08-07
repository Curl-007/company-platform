import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import { Button, FormField, SelectInput, TextArea, TextInput } from '../../../components/ui';
import type { OrganizationUnit, TeamMemberOverview } from '../../../types';
import type { UpdateUserInput } from '../api';
import { ROLE_OPTIONS } from './teamMeta';

export default function EditMemberDialog({
  member,
  departments,
  onClose,
  onSubmit,
}: {
  member: TeamMemberOverview;
  departments: OrganizationUnit[];
  onClose: () => void;
  onSubmit: (input: UpdateUserInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState({
    name: member.name,
    email: member.email,
    phone: member.phone ?? '',
    position: member.position ?? '',
    departmentId: member.departmentId ?? '',
    bio: member.bio ?? '',
    role: member.role,
    status: member.status ?? 'active',
    password: '',
  });
  const [submitting, setSubmitting] = useState(false);

  function setField(key: keyof typeof draft, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim() || !draft.email.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: draft.name.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        position: draft.position.trim(),
        departmentId: draft.departmentId || null,
        bio: draft.bio.trim(),
        role: draft.role,
        status: draft.status,
        ...(draft.password.trim() ? { password: draft.password } : {}),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={680}>
      <Panel title={t('features.team.editMemberDialog.editTitle')} subtitle={t('features.team.editMemberDialog.subtitle')}>
        <form className="team-create-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <FormField label={t('features.team.editMemberDialog.nameLabel')} htmlFor="team-edit-name" required>
              <TextInput id="team-edit-name" value={draft.name} onChange={(event) => setField('name', event.target.value)} required />
            </FormField>
            <FormField label={t('features.team.editMemberDialog.emailLabel')} htmlFor="team-edit-email" required>
              <TextInput id="team-edit-email" type="email" value={draft.email} onChange={(event) => setField('email', event.target.value)} required />
            </FormField>
          </div>
          <div className="form-row">
            <FormField label={t('features.team.editMemberDialog.roleLabel')} htmlFor="team-edit-role" required>
              <SelectInput id="team-edit-role" value={draft.role} onChange={(event) => setField('role', event.target.value)}>
                {ROLE_OPTIONS.filter((item) => item.value).map((item) => <option key={item.value} value={item.value}>{t(item.label)}</option>)}
              </SelectInput>
            </FormField>
            <FormField label={t('features.team.editMemberDialog.statusLabel')} htmlFor="team-edit-status">
              <SelectInput id="team-edit-status" value={draft.status} onChange={(event) => setField('status', event.target.value)}>
                <option value="active">{t('features.team.editMemberDialog.enabled')}</option>
                <option value="disabled">{t('features.team.editMemberDialog.disabled')}</option>
              </SelectInput>
            </FormField>
          </div>
          <div className="form-row">
            <FormField label={t('features.team.editMemberDialog.phoneLabel')} htmlFor="team-edit-phone">
              <TextInput id="team-edit-phone" value={draft.phone} onChange={(event) => setField('phone', event.target.value)} />
            </FormField>
            <FormField label={t('features.team.editMemberDialog.positionLabel')} htmlFor="team-edit-position">
              <TextInput id="team-edit-position" value={draft.position} onChange={(event) => setField('position', event.target.value)} />
            </FormField>
          </div>
          <FormField label={t('features.team.editMemberDialog.departmentLabel')} htmlFor="team-edit-department">
            <SelectInput id="team-edit-department" value={draft.departmentId} onChange={(event) => setField('departmentId', event.target.value)}>
              <option value="">{t('features.team.createMemberDialog.noDepartment')}</option>
              {departments.filter((item) => item.status === 'active' || item.id === member.departmentId).map((item) => <option key={item.id} value={item.id}>{item.name}{item.status === 'archived' ? t('features.team.editMemberDialog.archivedSuffix') : ''}</option>)}
            </SelectInput>
          </FormField>
          <FormField label={t('features.team.editMemberDialog.bioLabel')} htmlFor="team-edit-bio">
            <TextArea id="team-edit-bio" rows={3} value={draft.bio} onChange={(event) => setField('bio', event.target.value)} />
          </FormField>
          <FormField label={t('features.team.editMemberDialog.passwordLabel')} htmlFor="team-edit-password" helpText={t('features.team.editMemberDialog.passwordHelp')}>
            <div className="input-with-icon">
              <KeyRound size={14} />
              <TextInput id="team-edit-password" type="password" value={draft.password} onChange={(event) => setField('password', event.target.value)} minLength={4} />
            </div>
          </FormField>
          <div className="team-create-actions">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>{t('common.cancel')}</Button>
            <Button type="submit" variant="primary" size="sm" disabled={submitting}>{submitting ? t('features.team.editMemberDialog.saving') : t('features.team.editMemberDialog.saveChanges')}</Button>
          </div>
        </form>
      </Panel>
    </Overlay>
  );
}
