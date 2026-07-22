import { useState, type FormEvent } from 'react';
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
      <Panel title="编辑成员账号" subtitle="这里维护成员的账号状态、角色职责和协作资料；项目内分工仍在项目成员中维护。">
        <form className="team-create-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <FormField label="姓名" htmlFor="team-edit-name" required>
              <TextInput id="team-edit-name" value={draft.name} onChange={(event) => setField('name', event.target.value)} required />
            </FormField>
            <FormField label="邮箱" htmlFor="team-edit-email" required>
              <TextInput id="team-edit-email" type="email" value={draft.email} onChange={(event) => setField('email', event.target.value)} required />
            </FormField>
          </div>
          <div className="form-row">
            <FormField label="角色" htmlFor="team-edit-role" required>
              <SelectInput id="team-edit-role" value={draft.role} onChange={(event) => setField('role', event.target.value)}>
                {ROLE_OPTIONS.filter((item) => item.value).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </SelectInput>
            </FormField>
            <FormField label="账号状态" htmlFor="team-edit-status">
              <SelectInput id="team-edit-status" value={draft.status} onChange={(event) => setField('status', event.target.value)}>
                <option value="active">已启用</option>
                <option value="disabled">已停用</option>
              </SelectInput>
            </FormField>
          </div>
          <div className="form-row">
            <FormField label="手机号" htmlFor="team-edit-phone">
              <TextInput id="team-edit-phone" value={draft.phone} onChange={(event) => setField('phone', event.target.value)} />
            </FormField>
            <FormField label="职位" htmlFor="team-edit-position">
              <TextInput id="team-edit-position" value={draft.position} onChange={(event) => setField('position', event.target.value)} />
            </FormField>
          </div>
          <FormField label="部门" htmlFor="team-edit-department">
            <SelectInput id="team-edit-department" value={draft.departmentId} onChange={(event) => setField('departmentId', event.target.value)}>
              <option value="">未归属部门</option>
              {departments.filter((item) => item.status === 'active' || item.id === member.departmentId).map((item) => <option key={item.id} value={item.id}>{item.name}{item.status === 'archived' ? '（已归档）' : ''}</option>)}
            </SelectInput>
          </FormField>
          <FormField label="简介" htmlFor="team-edit-bio">
            <TextArea id="team-edit-bio" rows={3} value={draft.bio} onChange={(event) => setField('bio', event.target.value)} />
          </FormField>
          <FormField label="重置密码" htmlFor="team-edit-password" helpText="不填写则保持原密码。">
            <div className="input-with-icon">
              <KeyRound size={14} />
              <TextInput id="team-edit-password" type="password" value={draft.password} onChange={(event) => setField('password', event.target.value)} minLength={4} />
            </div>
          </FormField>
          <div className="team-create-actions">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>取消</Button>
            <Button type="submit" variant="primary" size="sm" disabled={submitting}>{submitting ? '保存中...' : '保存修改'}</Button>
          </div>
        </form>
      </Panel>
    </Overlay>
  );
}
