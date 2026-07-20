import { useEffect, useState } from 'react';
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
      setFormError(err instanceof ApiError ? err.message : '加载项目成员失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMembers();
  }, [projectId]);

  async function handleAddMember() {
    if (!canManageMembers) {
      setFormError('当前账号无权维护项目成员。');
      return;
    }
    if (!userName.trim()) {
      setFormError('请输入成员名称');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await addProjectMember(projectId, { userName: userName.trim(), role });
      setUserName('');
      await loadMembers();
      toast.success(`已添加项目成员：${userName.trim()}`);
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : '添加项目成员失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteMember(member: ProjectMember) {
    if (!canManageMembers) {
      toast.error('当前账号无权移出项目成员。');
      return;
    }
    const confirmed = await confirm({
      title: `移出项目成员“${member.userName}”？`,
      description: '移出后该成员不会再计入项目成员统计和日报缺报统计。',
      confirmText: '移出成员',
      tone: 'warning',
    });
    if (!confirmed) return;

    try {
      await deleteProjectMember(projectId, member.id);
      setMembers((current) => current.filter((item) => item.id !== member.id));
      toast.success(`已移除项目成员：${member.userName}`);
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : '移除项目成员失败');
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel
        title="项目成员管理"
        subtitle={`${projectName} · 维护项目归属成员，用于日报缺报统计与协作分派`}
        style={{ maxWidth: 760 }}
      >
        {formError ? <div className="form-error" style={{ marginBottom: 12 }}>{formError}</div> : null}

        {canManageMembers ? <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          <div className="form-row" style={{ alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label" htmlFor="project-member-name">成员名称</label>
              <input
                id="project-member-name"
                className="form-input"
                value={userName}
                onChange={(event) => setUserName(event.target.value)}
                placeholder="输入项目成员姓名"
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="project-member-role">角色</label>
              <select
                id="project-member-role"
                className="form-select"
                value={role}
                onChange={(event) => setRole(event.target.value)}
              >
                <option value="pdm">产品经理</option>
                <option value="dev">开发</option>
                <option value="qa">测试</option>
              </select>
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleAddMember} disabled={submitting}>
              {submitting ? '添加中...' : '添加成员'}
            </button>
          </div>
        </div> : <div className="form-help-text" style={{ marginBottom: 12 }}>当前账号为只读模式，不能添加或移出项目成员。</div>}

        <Panel title="当前成员" subtitle={`共 ${members.length} 人`} noPadding>
          {loading ? (
            <div style={{ padding: 16 }} className="text-secondary">加载中...</div>
          ) : members.length === 0 ? (
            <div style={{ padding: 16 }} className="text-secondary">当前项目还没有手工维护成员。</div>
          ) : (
            <DataTable
              rowKey="id"
              data={members}
              columns={[
                {
                  key: 'userName',
                  title: '成员',
                  render: (item) => <span className="font-medium">{item.userName}</span>,
                },
                {
                  key: 'role',
                  title: '角色',
                  render: (item) => (
                    <StatusBadge
                      status={item.role}
                      label={item.role === 'pdm' ? '产品经理' : item.role === 'dev' ? '开发' : '测试'}
                      showDot={false}
                    />
                  ),
                },
                {
                  key: 'source',
                  title: '来源',
                  render: (item) => item.source || 'manual',
                },
                {
                  key: 'createdAt',
                  title: '加入时间',
                  render: (item) => item.createdAt?.slice(0, 19).replace('T', ' ') || '-',
                },
                {
                  key: 'actions',
                  title: '操作',
                  align: 'right',
                  render: (item) => canManageMembers ? (
                    <button
                      className="btn btn-text btn-xs"
                      style={{ color: 'var(--color-red, #dc2626)' }}
                      onClick={() => void handleDeleteMember(item)}
                    >
                      移除
                    </button>
                  ) : <span className="text-secondary">只读</span>,
                },
              ]}
              emptyText="暂无项目成员"
            />
          )}
        </Panel>

        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>关闭</button>
        </div>
      </Panel>
    </Overlay>
  );
}
