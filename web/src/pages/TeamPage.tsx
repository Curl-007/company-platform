import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity,
  Ban,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  IdCard,
  KeyRound,
  Mail,
  Pencil,
  Phone,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import StatusBadge from '../components/common/StatusBadge';
import Overlay from '../components/common/Overlay';
import ProgressBar from '../components/common/ProgressBar';
import { useAsync } from '../hooks/useAsync';
import {
  createUser,
  fetchTeamMembers,
  updateUser,
  type CreateUserInput,
  type UpdateUserInput,
} from '../services/resources';
import { ApiError } from '../services/api';
import { getSessionUser } from '../services/auth';
import { useToast } from '../components/common/Toast';
import { useConfirm } from '../components/common/ConfirmDialog';
import { Button, FormField, SelectInput, TextArea, TextInput } from '../components/ui';
import { canOperate } from '../constants/roles';
import type { TeamMemberOverview } from '../types';

type PresenceFilter = 'all' | 'online' | 'away' | 'offline';

const PRESENCE_LABELS: Record<string, string> = {
  online: '在线',
  away: '活跃过',
  offline: '离线',
};

const ROLE_LABELS: Record<string, string> = {
  admin: '系统管理员',
  pm: '项目经理',
  pdm: '产品经理',
  dev: '开发',
  qa: '测试',
};

const ROLE_OPTIONS = [
  { value: '', label: '全部角色' },
  { value: 'admin', label: '系统管理员' },
  { value: 'pm', label: '项目经理' },
  { value: 'pdm', label: '产品经理' },
  { value: 'dev', label: '开发' },
  { value: 'qa', label: '测试' },
];

const PRESENCE_OPTIONS: Array<{ value: PresenceFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'online', label: '在线' },
  { value: 'away', label: '活跃过' },
  { value: 'offline', label: '离线' },
];

const USER_STATUS_LABELS: Record<string, string> = {
  active: '已启用',
  disabled: '已停用',
};

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: '待处理',
  in_progress: '进行中',
  blocked: '阻塞',
  code_review: '代码评审',
  testing: '测试中',
  acceptance: '待验收',
  done: '已完成',
  cancelled: '已取消',
};

function statusLabel(map: Record<string, string>, value?: string | null): string {
  if (!value) return '未设置';
  return map[value] ?? value;
}

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'U';
  if (/[\u4e00-\u9fa5]/.test(trimmed)) return trimmed.slice(0, 2);
  return trimmed
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(value?: string | null): string {
  if (!value) return '暂无记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function completionRate(member: TeamMemberOverview): number {
  const total = member.stats.totalTasks || 0;
  if (!total) return 0;
  return Math.round((member.stats.doneTasks / total) * 100);
}

function workloadRate(member: TeamMemberOverview): number {
  const total = member.stats.estimatedHours || member.stats.actualHours + member.stats.remainingHours;
  if (!total) return 0;
  return Math.min(100, Math.round(((member.stats.actualHours + member.stats.remainingHours) / total) * 100));
}

function navigateTo(page: string, query?: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  window.location.hash = params.size ? `#/${page}?${params.toString()}` : `#/${page}`;
}

function TeamPage() {
  const sessionUser = getSessionUser();
  const canCreateUsers = canOperate(sessionUser, 'users:create');
  const canUpdateUsers = canOperate(sessionUser, 'users:update');
  const canDisableUsers = canOperate(sessionUser, 'users:disable');
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useAsync<TeamMemberOverview[]>(fetchTeamMembers, []);
  const members = data ?? [];
  const [keyword, setKeyword] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('');
  const [presence, setPresence] = useState<PresenceFilter>('all');
  const [selected, setSelected] = useState<TeamMemberOverview | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TeamMemberOverview | null>(null);
  const [togglingMemberId, setTogglingMemberId] = useState<string | null>(null);

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

  return (
    <div className="team-page">
      <PageHeader
        title="团队管理"
        description="统一维护成员账号、职责权限、项目参与、任务负载和日报风险；系统设置只保留平台级配置。"
        actions={canCreateUsers ? (
          <Button variant="primary" size="sm" icon={<UserPlus size={16} />} onClick={() => setCreating(true)}>
            新建成员
          </Button>
        ) : null}
      />

      <div className="team-summary-grid">
        <TeamSummaryCard icon={<Users size={18} />} label="团队成员" value={summary.total} meta={`${summary.active} 个可用账号`} />
        <TeamSummaryCard icon={<Activity size={18} />} label="在线/活跃" value={summary.online} meta="最近 30 分钟有操作" />
        <TeamSummaryCard icon={<BriefcaseBusiness size={18} />} label="参与项目" value={summary.projects} meta={`${summary.activeTaskMembers} 人有进行中任务`} />
        <TeamSummaryCard icon={<ShieldCheck size={18} />} label="风险阻塞" value={summary.blockers} meta="阻塞任务、缺陷与日报阻塞" tone={summary.blockers > 0 ? 'risk' : 'success'} />
      </div>

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
            <span>项目经理查看成员负载、项目参与、任务和日报风险。</span>
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
                    <span>任务完成率</span>
                    <strong>{completionRate(member)}%</strong>
                  </div>
                  <ProgressBar percent={completionRate(member)} height={6} showPercent={false} />
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
      {creating && canCreateUsers && <CreateMemberDialog onClose={() => setCreating(false)} onSubmit={handleCreate} />}
      {editing && canUpdateUsers && (
        <EditMemberDialog
          member={editing}
          onClose={() => setEditing(null)}
          onSubmit={(input) => handleUpdate(editing, input)}
        />
      )}
    </div>
  );
}

function TeamSummaryCard({ icon, label, value, meta, tone = 'info' }: { icon: ReactNode; label: string; value: number; meta: string; tone?: 'info' | 'risk' | 'success' }) {
  return (
    <div className={`team-summary-card ${tone}`}>
      <div className="team-summary-icon">{icon}</div>
      <div>
        <div className="team-summary-label">{label}</div>
        <div className="team-summary-value">{value}</div>
        <div className="team-summary-meta">{meta}</div>
      </div>
    </div>
  );
}

function MemberDetail({
  member,
  canUpdateUsers,
  canDisableUsers,
  currentUserId,
  toggling,
  onClose,
  onEdit,
  onToggleStatus,
}: {
  member: TeamMemberOverview;
  canUpdateUsers: boolean;
  canDisableUsers: boolean;
  currentUserId?: string;
  toggling: boolean;
  onClose: () => void;
  onEdit: () => void;
  onToggleStatus: () => void;
}) {
  const isCurrentUser = member.id === currentUserId;
  const isDisabled = member.status === 'disabled';

  return (
    <Overlay onClose={onClose} maxWidth={920}>
      <Panel
        className="team-detail-panel"
        title={member.name}
        subtitle={`${member.department || '未设置部门'} · ${statusLabel(ROLE_LABELS, member.role)} · ${PRESENCE_LABELS[member.presence]}`}
        toolbar={<StatusBadge status={member.status ?? 'active'} label={statusLabel(USER_STATUS_LABELS, member.status ?? 'active')} showDot={false} />}
      >
        <div className="team-detail-hero">
          <div className="team-avatar large">{initials(member.name)}</div>
          <div className="team-detail-profile">
            <div className="team-detail-email"><Mail size={14} />{member.email}</div>
            <div className="team-detail-active"><Clock3 size={14} />最近活动：{formatDate(member.lastActiveAt)}</div>
            {member.phone ? <div className="team-detail-active"><Phone size={14} />{member.phone}</div> : null}
            {member.position ? <div className="team-detail-active"><IdCard size={14} />{member.position}</div> : null}
            <div className="team-skill-row">
              {member.skills.map((skill) => <span key={skill} className="team-skill">{skill}</span>)}
            </div>
          </div>
        </div>

        <div className="team-detail-metrics">
          <DetailMetric label="全部任务" value={member.stats.totalTasks} />
          <DetailMetric label="进行中" value={member.stats.activeTasks} />
          <DetailMetric label="已完成" value={member.stats.doneTasks} />
          <DetailMetric label="阻塞/风险" value={member.stats.blockers} tone={member.stats.blockers > 0 ? 'risk' : 'neutral'} />
          <DetailMetric label="需求关联" value={member.stats.requirements} />
          <DetailMetric label="日报数量" value={member.stats.workLogs} />
        </div>

        <div className="team-detail-workload">
          <div className="team-progress-head">
            <span>工作量占用</span>
            <strong>{member.stats.actualHours}h 已用 / {member.stats.remainingHours}h 剩余</strong>
          </div>
          <ProgressBar percent={workloadRate(member)} height={8} showPercent={false} />
        </div>

        <div className="team-detail-grid">
          <section className="team-detail-section">
            <div className="team-section-title">参与项目</div>
            {member.projects.length ? member.projects.map((project) => (
              <button className="team-link-row" key={project.id} onClick={() => navigateTo('projects', { focus: project.id })}>
                <span>{project.name}</span>
                <span>{project.progress}%</span>
              </button>
            )) : <div className="team-empty-line">暂无项目参与记录</div>}
          </section>

          <section className="team-detail-section">
            <div className="team-section-title">近期任务</div>
            {member.recentTasks.length ? member.recentTasks.map((task) => (
              <div className="team-task-row" key={task.id}>
                <div>
                  <div className="team-task-title">{task.title}</div>
                  <div className="team-task-meta">截止：{task.dueDate || '未设置'}</div>
                </div>
                <StatusBadge status={task.status} label={statusLabel(TASK_STATUS_LABELS, task.status)} showDot={false} />
              </div>
            )) : <div className="team-empty-line">暂无进行中任务</div>}
          </section>

          <section className="team-detail-section wide">
            <div className="team-section-title">最近日报</div>
            {member.recentLogs.length ? member.recentLogs.map((log) => (
              <div className="team-log-row" key={log.id}>
                <div className="team-log-head">
                  <span>{log.project || '未绑定项目'}</span>
                  <span>{log.logDate || formatDate(log.createdAt)}</span>
                </div>
                <p>{log.content}</p>
                {log.blockers ? <div className="team-log-risk">阻塞：{log.blockers}</div> : null}
              </div>
            )) : <div className="team-empty-line">暂无日报记录</div>}
          </section>
        </div>

        <div className="team-detail-actions">
          <Button variant="secondary" size="sm" onClick={onClose}>关闭</Button>
          <Button variant="secondary" size="sm" onClick={() => navigateTo('teamlogs', { author: member.name })}>查看日报</Button>
          {canUpdateUsers || canDisableUsers ? (
            <>
              {canUpdateUsers ? (
                <Button variant="secondary" size="sm" icon={<Pencil size={14} />} onClick={onEdit}>
                  编辑账号
                </Button>
              ) : null}
              {canDisableUsers ? (
                <Button
                  variant={isDisabled ? 'primary' : 'danger'}
                  size="sm"
                  icon={isDisabled ? <CheckCircle2 size={14} /> : <Ban size={14} />}
                  onClick={onToggleStatus}
                  disabled={toggling || (isCurrentUser && !isDisabled)}
                  title={isCurrentUser && !isDisabled ? '不能停用当前登录账号' : undefined}
                >
                  {toggling ? '处理中...' : isDisabled ? '启用账号' : '停用账号'}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </Panel>
    </Overlay>
  );
}

function DetailMetric({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'risk' }) {
  return (
    <div className={`team-detail-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CreateMemberDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: CreateUserInput) => Promise<void> }) {
  const [draft, setDraft] = useState({
    name: '',
    email: '',
    phone: '',
    position: '',
    department: '',
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
        department: draft.department.trim(),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={640}>
      <Panel title="新建团队成员" subtitle="成员账号创建后会同步进入团队协作视图，由团队管理统一维护生命周期。">
        <form className="team-create-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <FormField label="姓名" htmlFor="team-create-name" required>
              <TextInput id="team-create-name" value={draft.name} onChange={(event) => setField('name', event.target.value)} required />
            </FormField>
            <FormField label="邮箱" htmlFor="team-create-email" required>
              <TextInput id="team-create-email" type="email" value={draft.email} onChange={(event) => setField('email', event.target.value)} required />
            </FormField>
          </div>
          <div className="form-row">
            <FormField label="角色" htmlFor="team-create-role" required>
              <SelectInput id="team-create-role" value={draft.role} onChange={(event) => setField('role', event.target.value)}>
                {ROLE_OPTIONS.filter((item) => item.value).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </SelectInput>
            </FormField>
            <FormField label="初始密码" htmlFor="team-create-password" required>
              <div className="input-with-icon">
                <KeyRound size={14} />
                <TextInput id="team-create-password" type="password" value={draft.password} onChange={(event) => setField('password', event.target.value)} required minLength={4} />
              </div>
            </FormField>
          </div>
          <div className="form-row">
            <FormField label="手机号" htmlFor="team-create-phone">
              <TextInput id="team-create-phone" value={draft.phone} onChange={(event) => setField('phone', event.target.value)} />
            </FormField>
            <FormField label="职位" htmlFor="team-create-position">
              <TextInput id="team-create-position" value={draft.position} onChange={(event) => setField('position', event.target.value)} />
            </FormField>
          </div>
          <FormField label="部门" htmlFor="team-create-department">
            <TextInput id="team-create-department" value={draft.department} onChange={(event) => setField('department', event.target.value)} />
          </FormField>
          <div className="team-create-actions">
            <Button variant="secondary" size="sm" onClick={onClose}>取消</Button>
            <Button type="submit" variant="primary" size="sm" disabled={submitting}>{submitting ? '创建中...' : '创建成员'}</Button>
          </div>
        </form>
      </Panel>
    </Overlay>
  );
}

function EditMemberDialog({
  member,
  onClose,
  onSubmit,
}: {
  member: TeamMemberOverview;
  onClose: () => void;
  onSubmit: (input: UpdateUserInput) => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    name: member.name,
    email: member.email,
    phone: member.phone ?? '',
    position: member.position ?? '',
    department: member.department ?? '',
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
        department: draft.department.trim(),
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
            <TextInput id="team-edit-department" value={draft.department} onChange={(event) => setField('department', event.target.value)} />
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

export default TeamPage;
