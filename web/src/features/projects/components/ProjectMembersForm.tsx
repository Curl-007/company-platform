import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addProjectMember, deleteProjectMember, fetchProjectMembers } from '../api';
import { ApiError } from '../../../services/api';
import DataTable from '../../../components/common/DataTable';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useToast } from '../../../components/common/Toast';
import type { ProjectMember } from '../../../types';

interface ProjectMembersFormProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
  canManageMembers: boolean;
}

export default function ProjectMembersForm({ projectId, projectName, onClose, canManageMembers }: ProjectMembersFormProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [userName, setUserName] = useState('');
  const [role, setRole] = useState('dev');
  const [formError, setFormError] = useState<string | null>(null);

  async function loadMembers() {
    setLoading(true);
    setFormError(null);
    try {
      const data = await fetchProjectMembers(projectId);
      setMembers(data);
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : t('features.projects.projectMembersForm.loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMembers();
  }, [projectId]);

  async function handleAddMember() {
    if (!canManageMembers) {
      setFormError(t('features.projects.projectMembersForm.noPermission'));
      return;
    }
    if (!userName.trim()) {
      setFormError(t('features.projects.projectMembersForm.nameRequired'));
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await addProjectMember(projectId, { userName: userName.trim(), role });
      setUserName('');
      await loadMembers();
      toast.success(t('features.projects.projectMembersForm.added', { name: userName.trim() }));
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : t('features.projects.projectMembersForm.addFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteMember(member: ProjectMember) {
    if (!canManageMembers) {
      toast.error(t('features.projects.projectMembersForm.noRemovePermission'));
      return;
    }
    const confirmed = await confirm({
      title: t('features.projects.projectMembersForm.removeConfirm', { name: member.userName }),
      description: t('features.projects.projectMembersForm.removeDesc'),
      confirmText: t('features.projects.projectMembersForm.removeConfirmText'),
      tone: 'warning',
    });
    if (!confirmed) return;

    try {
      await deleteProjectMember(projectId, member.id);
      setMembers((current) => current.filter((item) => item.id !== member.id));
      toast.success(t('features.projects.projectMembersForm.removed', { name: member.userName }));
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : t('features.projects.projectMembersForm.removeFailed'));
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel
        title={t('features.projects.projectMembersForm.title')}
        subtitle={t('features.projects.projectMembersForm.subtitle', { name: projectName })}
        style={{ maxWidth: 760 }}
      >
        {formError ? <div className="form-error" style={{ marginBottom: 12 }}>{formError}</div> : null}

        {canManageMembers ? <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          <div className="form-row" style={{ alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label" htmlFor="project-member-name">{t('features.projects.projectMembersForm.memberNameLabel')}</label>
              <input
                id="project-member-name"
                className="form-input"
                value={userName}
                onChange={(event) => setUserName(event.target.value)}
                placeholder={t('features.projects.projectMembersForm.memberNamePlaceholder')}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="project-member-role">{t('features.projects.projectMembersForm.roleLabel')}</label>
              <select
                id="project-member-role"
                className="form-select"
                value={role}
                onChange={(event) => setRole(event.target.value)}
              >
                <option value="pdm">{t('features.projects.projectMembersForm.rolePdm')}</option>
                <option value="dev">{t('features.projects.projectMembersForm.roleDev')}</option>
                <option value="qa">{t('features.projects.projectMembersForm.roleQa')}</option>
              </select>
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleAddMember} disabled={submitting}>
              {submitting ? t('features.projects.projectMembersForm.adding') : t('features.projects.projectMembersForm.addMember')}
            </button>
          </div>
        </div> : <div className="form-help-text" style={{ marginBottom: 12 }}>{t('features.projects.projectMembersForm.readonlyNote')}</div>}

        <Panel title={t('features.projects.projectMembersForm.currentMembers')} subtitle={t('features.projects.projectMembersForm.memberCount', { count: members.length })} noPadding>
          {loading ? (
            <div style={{ padding: 16 }} className="text-secondary">{t('common.loading')}</div>
          ) : members.length === 0 ? (
            <div style={{ padding: 16 }} className="text-secondary">{t('features.projects.projectMembersForm.noMembers')}</div>
          ) : (
            <DataTable
              rowKey="id"
              data={members}
              columns={[
                {
                  key: 'userName',
                  title: t('features.projects.projectMembersForm.colMember'),
                  render: (item) => <span className="font-medium">{item.userName}</span>,
                },
                {
                  key: 'role',
                  title: t('features.projects.projectMembersForm.roleLabel'),
                  render: (item) => (
                    <StatusBadge
                      status={item.role}
                      label={item.role === 'pdm' ? t('features.projects.projectMembersForm.rolePdm') : item.role === 'dev' ? t('features.projects.projectMembersForm.roleDev') : t('features.projects.projectMembersForm.roleQa')}
                      showDot={false}
                    />
                  ),
                },
                {
                  key: 'source',
                  title: t('features.projects.projectMembersForm.colSource'),
                  render: (item) => item.source || 'manual',
                },
                {
                  key: 'createdAt',
                  title: t('features.projects.projectMembersForm.colJoined'),
                  render: (item) => item.createdAt?.slice(0, 19).replace('T', ' ') || '-',
                },
                {
                  key: 'actions',
                  title: t('common.actions'),
                  align: 'right',
                  render: (item) => canManageMembers ? (
                    <button
                      className="btn btn-text btn-xs"
                      style={{ color: 'var(--color-red, #dc2626)' }}
                      onClick={() => void handleDeleteMember(item)}
                    >
                      {t('features.projects.projectMembersForm.remove')}
                    </button>
                  ) : <span className="text-secondary">{t('features.projects.projectMembersForm.readonly')}</span>,
                },
              ]}
              emptyText={t('features.projects.projectMembersForm.emptyMembers')}
            />
          )}
        </Panel>

        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>{t('common.close')}</button>
        </div>
      </Panel>
    </Overlay>
  );
}
