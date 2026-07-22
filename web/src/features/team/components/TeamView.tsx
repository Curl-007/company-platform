import { useMemo, useState } from 'react';
import {
  Activity,
  BriefcaseBusiness,
  Building2,
  KeyRound,
  Mail,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import PageHeader from '../../../components/common/PageHeader';
import Panel from '../../../components/common/Panel';
import PageState from '../../../components/common/PageState';
import StatusBadge from '../../../components/common/StatusBadge';
import MetricStrip from '../../../components/common/MetricStrip';
import { useAsync } from '../../../hooks/useAsync';
import {
  createUser,
  fetchDepartments,
  fetchTeamMembers,
  updateUser,
  type CreateUserInput,
  type UpdateUserInput,
} from '../api';
import { ApiError } from '../../../services/api';
import { getSessionUser } from '../../../services/auth';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { Button } from '../../../components/ui';
import { canOperate } from '../../../constants/roles';
import type { OrganizationUnit, TeamMemberOverview } from '../../../types';
import CreateMemberDialog from './CreateMemberDialog';
import DepartmentDirectoryDialog from './DepartmentDirectoryDialog';
import EditMemberDialog from './EditMemberDialog';
import MemberDetail from './MemberDetail';
import {
  initials,
  navigateTo,
  PRESENCE_LABELS,
  PRESENCE_OPTIONS,
  type PresenceFilter,
  ROLE_LABELS,
  ROLE_OPTIONS,
  statusLabel,
  USER_STATUS_LABELS,
} from './teamMeta';

export default function TeamView() {
  const sessionUser = getSessionUser();
  const canCreateUsers = canOperate(sessionUser, 'users:create');
  const canUpdateUsers = canOperate(sessionUser, 'users:update');
  const canDisableUsers = canOperate(sessionUser, 'users:disable');
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useAsync<TeamMemberOverview[]>(fetchTeamMembers, []);
  const departmentsAsync = useAsync<OrganizationUnit[]>(fetchDepartments, []);
  const members = data ?? [];
  const organizationUnits = departmentsAsync.data ?? [];
  const [keyword, setKeyword] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('');
  const [presence, setPresence] = useState<PresenceFilter>('all');
  const [selected, setSelected] = useState<TeamMemberOverview | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TeamMemberOverview | null>(null);
  const [togglingMemberId, setTogglingMemberId] = useState<string | null>(null);
  const [managingDepartments, setManagingDepartments] = useState(false);

  const departments = useMemo(() => Array.from(new Set(members.map((item) => item.department).filter(Boolean))), [members]);

  const filteredMembers = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return members.filter((member) => {
      const matchesKeyword = !kw || [
        member.name,
        member.email,
        member.role,
        member.department,
        member.position ?? '',
        member.phone ?? '',
        ...member.skills,
      ].some((item) => item.toLowerCase().includes(kw));
      const matchesRole = !role || member.role === role;
      const matchesDepartment = !department || member.department === department;
      const matchesPresence = presence === 'all' || member.presence === presence;
      return matchesKeyword && matchesRole && matchesDepartment && matchesPresence;
    });
  }, [department, keyword, members, presence, role]);

  const summary = useMemo(() => {
    const activeMembers = members.filter((item) => item.status !== 'disabled');
    const projectIds = new Set(members.flatMap((item) => item.projects.map((project) => project.id)));
    const activeTaskMembers = members.filter((item) => item.stats.activeTasks > 0).length;
    return {
      total: members.length,
      active: activeMembers.length,
      online: members.filter((item) => item.presence === 'online').length,
      projects: projectIds.size,
      activeTaskMembers,
      blockers: members.reduce((sum, item) => sum + item.stats.blockers, 0),
    };
  }, [members]);

  async function handleCreate(input: CreateUserInput) {
    try {
      await createUser(input);
      toast.success(`已创建成员 ${input.name}`);
      setCreating(false);
      await reload();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : '创建成员失败');
    }
  }

  async function handleUpdate(member: TeamMemberOverview, input: UpdateUserInput) {
    try {
      const updated = await updateUser(member.id, input);
      toast.success(`已更新 ${updated.name}`);
      setEditing(null);
      setSelected((current) => (current?.id === member.id ? { ...current, ...updated } : current));
      await reload();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : '更新成员失败');
    }
  }

  async function handleToggleStatus(member: TeamMemberOverview) {
    if (member.id === sessionUser?.id && member.status !== 'disabled') {
      toast.info('不能停用当前登录账号');
      return;
    }
    const isDisabled = member.status === 'disabled';
    const confirmed = await confirm({
      title: isDisabled ? '启用成员账号？' : '停用成员账号？',
      description: isDisabled
        ? `启用后，${member.name} 可以重新登录并参与协作。`
        : `停用后，${member.name} 将不能登录系统，但历史数据会保留。`,
      confirmText: isDisabled ? '启用账号' : '停用账号',
      tone: isDisabled ? 'info' : 'danger',
    });
    if (!confirmed) return;

    setTogglingMemberId(member.id);
    try {
      const updated = await updateUser(member.id, { status: isDisabled ? 'active' : 'disabled' });
      toast.success(isDisabled ? '账号已启用' : '账号已停用');
      setSelected((current) => (current?.id === member.id ? { ...current, ...updated } : current));
      await reload();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : '更新账号状态失败');
    } finally {
      setTogglingMemberId(null);
    }
  }

  async function handleDepartmentChange() {
    await Promise.all([departmentsAsync.reload(), reload()]);
  }

  return (
    <div className="team-page">
      <PageHeader
        title="团队管理"
        description="统一维护成员账号、职责权限、项目参与和协作风险；工时、容量、WIP 与任务信息仅用于资源协调和风险提示，不用于个人绩效评价。"
        actions={canCreateUsers ? (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={<Building2 size={16} />} onClick={() => setManagingDepartments(true)}>
              部门目录
            </Button>
            <Button variant="primary" size="sm" icon={<UserPlus size={16} />} onClick={() => setCreating(true)}>
              新建成员
            </Button>
          </div>
        ) : null}
      />

      <MetricStrip
        className="team-summary-grid"
        items={[
          {
            icon: <Users size={18} />,
            label: '团队成员',
            value: summary.total,
            caption: `${summary.active} 个可用账号`,
            tone: 'info',
            className: 'team-summary-card info',
          },
          {
            icon: <Activity size={18} />,
            label: '在线/活跃',
            value: summary.online,
            caption: '最近 30 分钟有操作',
            tone: 'info',
            className: 'team-summary-card info',
          },
          {
            icon: <BriefcaseBusiness size={18} />,
            label: '参与项目',
            value: summary.projects,
            caption: `${summary.activeTaskMembers} 人有进行中任务`,
            tone: 'info',
            className: 'team-summary-card info',
          },
          {
            icon: <ShieldCheck size={18} />,
            label: '风险阻塞',
            value: summary.blockers,
            caption: '阻塞任务、缺陷与日报阻塞',
            tone: summary.blockers > 0 ? 'risk' : 'success',
            className: `team-summary-card ${summary.blockers > 0 ? 'risk' : 'success'}`,
          },
        ]}
      />

      <div className="team-governance-strip">
        <div className="team-governance-item">
          <span className="team-governance-icon"><KeyRound size={16} /></span>
          <div>
            <strong>账号治理</strong>
            <span>管理员维护账号、角色和状态；停用保留历史数据。</span>
          </div>
        </div>
        <div className="team-governance-item">
          <span className="team-governance-icon"><BriefcaseBusiness size={16} /></span>
          <div>
            <strong>团队协作</strong>
            <span>项目经理查看资源协调、项目参与、任务和日报风险，不形成个人绩效结论。</span>
          </div>
        </div>
        <div className="team-governance-item">
          <span className="team-governance-icon"><ShieldCheck size={16} /></span>
          <div>
            <strong>权限边界</strong>
            <span>{canCreateUsers || canUpdateUsers || canDisableUsers ? '当前账号可执行账号治理。' : '当前账号仅可查看团队协作数据。'}</span>
          </div>
        </div>
      </div>

      <Panel
        title="成员视图"
        subtitle={`当前显示 ${filteredMembers.length} / ${members.length} 人`}
        toolbar={
          <Button variant="secondary" size="sm" onClick={() => navigateTo('teamlogs')}>
            查看团队日报
          </Button>
        }
      >
        <div className="team-filter-bar">
          <div className="team-search-box">
            <Search size={16} />
            <input className="form-input" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索姓名、邮箱、手机号、职责或部门" />
          </div>
          <select className="form-select" value={role} onChange={(event) => setRole(event.target.value)}>
            {ROLE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select className="form-select" value={department} onChange={(event) => setDepartment(event.target.value)}>
            <option value="">全部部门</option>
            {departments.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="form-select" value={presence} onChange={(event) => setPresence(event.target.value as PresenceFilter)}>
            {PRESENCE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>

        {loading || error ? (
          <PageState loading={loading} error={error} onRetry={reload} />
        ) : filteredMembers.length === 0 ? (
          <PageState loading={false} error={null} isEmpty emptyTitle="暂无成员" emptyDescription="当前筛选条件下没有匹配的团队成员。" />
        ) : (
          <div className="team-member-grid">
            {filteredMembers.map((member) => (
              <button className="team-member-card" key={member.id} onClick={() => setSelected(member)}>
                <div className="team-member-top">
                  <div className="team-avatar-wrap">
                    <div className="team-avatar">{initials(member.name)}</div>
                    <span className={`team-presence-dot ${member.presence}`} title={PRESENCE_LABELS[member.presence]} />
                  </div>
                  <div className="team-member-title">
                    <div className="team-member-name">{member.name}</div>
                    <div className="team-member-email"><Mail size={13} />{member.email}</div>
                  </div>
                  <StatusBadge status={member.role} label={statusLabel(ROLE_LABELS, member.role)} showDot={false} />
                </div>

                <div className="team-member-meta">
                  <span>{member.department || '未设置部门'}</span>
                  <StatusBadge status={member.status ?? 'active'} label={statusLabel(USER_STATUS_LABELS, member.status ?? 'active')} showDot={false} />
                </div>

                <div className="team-card-progress">
                  <div className="team-progress-head">
                    <span>协作状态</span>
                    <strong>{member.stats.blockers > 0 ? `${member.stats.blockers} 项需协调` : '无阻塞提示'}</strong>
                  </div>
                  <div className="text-secondary" style={{ fontSize: 12 }}>进行中 {member.stats.activeTasks} 项 · 未关闭缺陷 {member.stats.openDefects} 项</div>
                </div>

                <div className="team-stat-row">
                  <span><strong>{member.stats.activeTasks}</strong> 进行中</span>
                  <span><strong>{member.stats.openDefects}</strong> 未关缺陷</span>
                  <span><strong>{member.projects.length}</strong> 项目</span>
                </div>

                <div className="team-skill-row">
                  {member.skills.slice(0, 3).map((skill) => <span key={skill} className="team-skill">{skill}</span>)}
                </div>
              </button>
            ))}
          </div>
        )}
      </Panel>

      {selected && (
        <MemberDetail
          member={selected}
          canUpdateUsers={canUpdateUsers}
          canDisableUsers={canDisableUsers}
          currentUserId={sessionUser?.id}
          toggling={togglingMemberId === selected.id}
          onClose={() => setSelected(null)}
          onEdit={() => setEditing(selected)}
          onToggleStatus={() => handleToggleStatus(selected)}
        />
      )}
      {creating && canCreateUsers && <CreateMemberDialog departments={organizationUnits} onClose={() => setCreating(false)} onSubmit={handleCreate} />}
      {editing && canUpdateUsers && (
        <EditMemberDialog
          member={editing}
          departments={organizationUnits}
          onClose={() => setEditing(null)}
          onSubmit={(input) => handleUpdate(editing, input)}
        />
      )}
      {managingDepartments && canCreateUsers && (
        <DepartmentDirectoryDialog
          departments={organizationUnits}
          members={members}
          onClose={() => setManagingDepartments(false)}
          onChanged={handleDepartmentChange}
        />
      )}
    </div>
  );
}
