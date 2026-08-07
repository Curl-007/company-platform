import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import { Button, FormField, SelectInput, TextInput } from '../../../components/ui';
import type { OrganizationUnit } from '../../../types';
import type { CreateUserInput } from '../api';
import { ROLE_OPTIONS } from './teamMeta';

export default function CreateMemberDialog({
  departments,
  onClose,
  onSubmit,
}: {
  departments: OrganizationUnit[];
  onClose: () => void;
  onSubmit: (input: CreateUserInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState({
    name: '',
    email: '',
    phone: '',
    position: '',
    departmentId: '',
    password: '',
    role: 'dev',
  });
  const [submitting, setSubmitting] = useState(false);

  function setField(key: keyof typeof draft, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim() || !draft.email.trim() || !draft.password.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: draft.name.trim(),
        email: draft.email.trim(),
        password: draft.password,
        role: draft.role,
        status: 'active',
        phone: draft.phone.trim(),
        position: draft.position.trim(),
        departmentId: draft.departmentId || null,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={640}>
      <Panel title={t('features.team.createMemberDialog.createTitle')} subtitle={t('features.team.createMemberDialog.subtitle')}>
        <form className="team-create-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <FormField label={t('features.team.createMemberDialog.nameLabel')} htmlFor="team-create-name" required>
              <TextInput id="team-create-name" value={draft.name} onChange={(event) => setField('name', event.target.value)} required />
            </FormField>
            <FormField label={t('features.team.createMemberDialog.emailLabel')} htmlFor="team-create-email" required>
              <TextInput id="team-create-email" type="email" value={draft.email} onChange={(event) => setField('email', event.target.value)} required />
            </FormField>
          </div>
          <div className="form-row">
            <FormField label={t('features.team.createMemberDialog.roleLabel')} htmlFor="team-create-role" required>
              <SelectInput id="team-create-role" value={draft.role} onChange={(event) => setField('role', event.target.value)}>
                {ROLE_OPTIONS.filter((item) => item.value).map((item) => <option key={item.value} value={item.value}>{t(item.label)}</option>)}
              </SelectInput>
            </FormField>
            <FormField label={t('features.team.createMemberDialog.passwordLabel')} htmlFor="team-create-password" required>
              <div className="input-with-icon">
                <KeyRound size={14} />
                <TextInput id="team-create-password" type="password" value={draft.password} onChange={(event) => setField('password', event.target.value)} required minLength={4} />
              </div>
            </FormField>
          </div>
          <div className="form-row">
            <FormField label={t('features.team.createMemberDialog.phoneLabel')} htmlFor="team-create-phone">
              <TextInput id="team-create-phone" value={draft.phone} onChange={(event) => setField('phone', event.target.value)} />
            </FormField>
            <FormField label={t('features.team.createMemberDialog.positionLabel')} htmlFor="team-create-position">
              <TextInput id="team-create-position" value={draft.position} onChange={(event) => setField('position', event.target.value)} />
            </FormField>
          </div>
          <FormField label={t('features.team.createMemberDialog.departmentLabel')} htmlFor="team-create-department">
            <SelectInput id="team-create-department" value={draft.departmentId} onChange={(event) => setField('departmentId', event.target.value)}>
              <option value="">{t('features.team.createMemberDialog.noDepartment')}</option>
              {departments.filter((item) => item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </SelectInput>
          </FormField>
          <div className="team-create-actions">
            <Button variant="secondary" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" variant="primary" size="sm" disabled={submitting}>{submitting ? t('features.team.createMemberDialog.creating') : t('features.team.createMemberDialog.createMember')}</Button>
          </div>
        </form>
      </Panel>
    </Overlay>
  );
}
