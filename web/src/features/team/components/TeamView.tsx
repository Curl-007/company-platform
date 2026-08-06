import { useMemo, useState } from 'react';
import { Building2, ChevronRight, FileText, Search, UserPlus } from 'lucide-react';
import Panel from '../../../components/common/Panel';
import PageState from '../../../components/common/PageState';
import StatusBadge from '../../../components/common/StatusBadge';
import DataTable, { type DataTableColumn } from '../../../components/common/DataTable';
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
import { Avatar, AvatarFallback, Button, ComboSelect, IconButton, Input } from '../../../components/ui';
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
  const { data, loading, error, reload } = useAsync<TeamMemberOverview[]>(fetchTeamMembers, [], { cacheKey: 'team:members' });
  const departmentsAsync = useAsync<OrganizationUnit[]>(fetchDepartments, [], { cacheKey: 'organization:departments' });
  const members = data ?? [];
  const organizationUnits = departmentsAsync.data ?? [];
  // 工作量信息仅用于资源协调和风险提示，不用于个人绩效评价。
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

  const columns = useMemo<DataTableColumn<TeamMemberOverview>[]>(() => [
    {
      key: 'member',
      title: '成员',
      width: '42%',
      render: (member) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar size="sm" className="border border-[var(--border)]">
            <AvatarFallback className="text-[11px] font-medium">{initials(member.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate font-medium">{member.name}</span>
              {member.id === sessionUser?.id ? <span className="shrink-0 text-xs text-[var(--muted-foreground)]">当前账号</span> : null}
            </div>
            <div className="truncate text-xs text-[var(--muted-foreground)]">
              {member.email} · {member.department || '未设置部门'}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      title: '角色',
      width: '20%',
      render: (member) => (
        <StatusBadge
          status={member.role}
          label={statusLabel(ROLE_LABELS, member.role)}
          showDot={false}
        />
      ),
    },
    {
      key: 'status',
      title: '状态',
      width: '28%',
      render: (member) => (
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <StatusBadge
              status={member.status ?? 'active'}
              label={statusLabel(USER_STATUS_LABELS, member.status ?? 'active')}
              showDot={false}
            />
            <span className="text-xs text-[var(--muted-foreground)]">{PRESENCE_LABELS[member.presence]}</span>
          </div>
          <span className="truncate text-xs text-[var(--muted-foreground)]">
            {member.stats.activeTasks} 项进行中 · {member.projects.length} 个项目
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      width: 56,
      align: 'right',
      render: (member) => (
        <div className="flex justify-end">
          <IconButton
            icon={<ChevronRight size={16} />}
            label={`查看${member.name}详情`}
            onClick={(event) => {
              event.stopPropagation();
              setSelected(member);
            }}
          />
        </div>
      ),
    },
  ], [sessionUser?.id]);

  return (
    <div className="team-page">
      {canCreateUsers ? (
        <div className="team-page-actions mb-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" icon={<Building2 size={16} />} onClick={() => setManagingDepartments(true)}>
            部门目录
          </Button>
          <Button variant="primary" size="sm" icon={<UserPlus size={16} />} onClick={() => setCreating(true)}>
            新建成员
          </Button>
        </div>
      ) : null}

      <Panel
        title="成员"
        subtitle={`当前显示 ${filteredMembers.length} / ${members.length} 人`}
        toolbar={
          <Button variant="secondary" size="sm" icon={<FileText size={14} />} onClick={() => navigateTo('teamlogs')}>
            查看团队日报
          </Button>
        }
        noPadding
      >
        <div className="team-filter-bar px-4 pt-4">
          <div className="team-search-box">
            <Search size={16} />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索姓名、邮箱、手机号、职责或部门"
              aria-label="搜索成员"
            />
          </div>
          <ComboSelect
            options={ROLE_OPTIONS}
            value={role}
            onChange={(v) => setRole(v)}
            ariaLabel="按角色筛选"
            className="min-w-[8rem]"
          />
          <ComboSelect
            options={[{ value: '', label: '全部部门' }, ...departments.map((d) => ({ value: d, label: d }))]}
            value={department}
            onChange={(v) => setDepartment(v)}
            searchPlaceholder="搜索部门..."
            ariaLabel="按部门筛选"
            className="min-w-[8rem]"
          />
          <ComboSelect
            options={PRESENCE_OPTIONS}
            value={presence}
            onChange={(v) => setPresence(v as PresenceFilter)}
            ariaLabel="按活跃状态筛选"
            className="min-w-[8rem]"
          />
        </div>

        {loading || error ? (
          <div className="px-4 pb-4"><PageState loading={loading} error={error} onRetry={reload} /></div>
        ) : filteredMembers.length === 0 ? (
          <div className="px-4 pb-4"><PageState loading={false} error={null} isEmpty emptyTitle="暂无成员" emptyDescription="当前筛选条件下没有匹配的团队成员。" /></div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredMembers}
            rowKey="id"
            onRowClick={setSelected}
            className="rounded-none border-x-0 border-b-0"
            emptyText="暂无成员"
          />
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
