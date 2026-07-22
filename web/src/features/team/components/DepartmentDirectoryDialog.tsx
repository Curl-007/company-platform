import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useToast } from '../../../components/common/Toast';
import { Button, FormField, SelectInput, TextArea, TextInput } from '../../../components/ui';
import { ApiError } from '../../../services/api';
import type { OrganizationUnit, TeamMemberOverview } from '../../../types';
import { createDepartment, deleteDepartment, updateDepartment } from '../api';
import { ROLE_LABELS } from './teamMeta';

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
  const toast = useToast();
  const confirm = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', parentId: '', managerUserId: '', responsibilities: '', status: 'active' as 'active' | 'archived' });
  const [submitting, setSubmitting] = useState(false);

  function setField(key: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setEditingId(null);
    setDraft({ name: '', parentId: '', managerUserId: '', responsibilities: '', status: 'active' });
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
      toast.success(editingId ? '部门已更新' : '部门已创建');
      await onChanged();
      reset();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : '保存部门失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function removeDepartment(item: OrganizationUnit) {
    const approved = await confirm({
      title: `删除部门“${item.name}”？`,
      description: '仅无成员且无下级部门的部门可以删除，历史审计记录会保留。',
      confirmText: '删除部门',
      tone: 'danger',
    });
    if (!approved) return;
    try {
      await deleteDepartment(item.id);
      toast.success('部门已删除');
      await onChanged();
      if (editingId === item.id) reset();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : '删除部门失败');
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={980}>
      <Panel
        title="部门目录"
        subtitle="部门用于成员归属、协作范围和资源协调；不用于个人绩效、排名、薪酬或人事决策。"
        toolbar={<Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={reset}>新建部门</Button>}
      >
        <div className="team-detail-grid">
          <section className="team-detail-section">
            <div className="team-section-title">{editingId ? '编辑部门' : '新建部门'}</div>
            <form className="form-stack" onSubmit={submit}>
              <FormField label="名称" htmlFor="department-name" required>
                <TextInput id="department-name" value={draft.name} onChange={(event) => setField('name', event.target.value)} required />
              </FormField>
              <FormField label="上级部门" htmlFor="department-parent">
                <SelectInput id="department-parent" value={draft.parentId} onChange={(event) => setField('parentId', event.target.value)}>
                  <option value="">无上级部门</option>
                  {departments.filter((item) => item.id !== editingId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </SelectInput>
              </FormField>
              <FormField label="部门负责人" htmlFor="department-manager">
                <SelectInput id="department-manager" value={draft.managerUserId} onChange={(event) => setField('managerUserId', event.target.value)}>
                  <option value="">暂不指定</option>
                  {members.filter((item) => item.status !== 'disabled').map((item) => <option key={item.id} value={item.id}>{item.name} · {ROLE_LABELS[item.role] ?? item.role}</option>)}
                </SelectInput>
              </FormField>
              <FormField label="职责范围" htmlFor="department-responsibilities">
                <TextArea id="department-responsibilities" rows={3} value={draft.responsibilities} onChange={(event) => setField('responsibilities', event.target.value)} />
              </FormField>
              {editingId ? <FormField label="状态" htmlFor="department-status"><SelectInput id="department-status" value={draft.status} onChange={(event) => setField('status', event.target.value)}><option value="active">启用</option><option value="archived">归档</option></SelectInput></FormField> : null}
              <div className="team-create-actions">
                {editingId ? <Button variant="secondary" size="sm" onClick={reset} disabled={submitting}>取消编辑</Button> : null}
                <Button type="submit" variant="primary" size="sm" disabled={submitting}>{submitting ? '保存中...' : editingId ? '保存部门' : '创建部门'}</Button>
              </div>
            </form>
          </section>
          <section className="team-detail-section">
            <div className="team-section-title">已登记部门</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {departments.length === 0 ? <div className="team-empty-line">暂无部门，请先创建部门后再分配成员。</div> : departments.map((item) => (
                <div key={item.id} className="team-link-row" style={{ cursor: 'default' }}>
                  <div>
                    <strong>{item.name}</strong>
                    <div className="team-task-meta">{item.memberCount} 名成员 · {item.status === 'archived' ? '已归档' : '启用中'}</div>
                    {item.responsibilities ? <div className="team-task-meta">{item.responsibilities}</div> : null}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" icon={<Pencil size={14} />} onClick={() => editDepartment(item)}>编辑</Button>
                    <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => removeDepartment(item)} disabled={item.memberCount > 0}>删除</Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
        <div className="team-detail-actions"><Button variant="secondary" size="sm" onClick={onClose}>关闭</Button></div>
      </Panel>
    </Overlay>
  );
}
