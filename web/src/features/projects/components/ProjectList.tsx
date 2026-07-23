import { useEffect, useMemo, useState } from 'react';
import { deleteProject, fetchProjects } from '../api';
import { filterProjects, sortProjects, type ProjectFilter } from '../listModel';
import { STORAGE_KEYS } from '../detailModel';
import CreateProjectForm from './CreateProjectForm';
import EditProjectForm from './EditProjectForm';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import Panel from '../../../components/common/Panel';
import PageState from '../../../components/common/PageState';
import DataTable, { type DataTableColumn } from '../../../components/common/DataTable';
import StatusBadge from '../../../components/common/StatusBadge';
import ProgressBar from '../../../components/common/ProgressBar';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import type { Project, SessionUser } from '../../../types';
import {
  PROJECT_STATUS_LABELS,
  PROCESS_MODE_LABELS,
  healthVariant,
  labelOf,
} from '../../../constants/enums';
import { canOperate } from '../../../constants/roles';

export default function ProjectList({
  onOpen,
  currentUser,
}: {
  onOpen: (id: string) => void;
  currentUser?: SessionUser | null;
}) {
  const { data, loading, error, reload } = useAsync<Project[]>(fetchProjects, [], { cacheKey: 'projects:list' });
  const [keyword, setKeyword] = useState(() => window.localStorage.getItem(STORAGE_KEYS.projectKeyword) ?? '');
  const [filter, setFilter] = useState<ProjectFilter>(() => {
    const saved = window.localStorage.getItem(STORAGE_KEYS.projectFilter);
    return saved === 'mine' || saved === 'risk' || saved === 'active' ? saved : 'all';
  });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const canCreateProject = canOperate(currentUser, 'projects:create');
  const canUpdateProject = canOperate(currentUser, 'projects:update');
  const canDeleteProject = canOperate(currentUser, 'projects:delete');

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.projectKeyword, keyword);
  }, [keyword]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.projectFilter, filter);
  }, [filter]);

  const sortedProjects = useMemo(() => sortProjects(data ?? []), [data]);

  const filtered = useMemo(
    () => filterProjects(sortedProjects, keyword, filter, currentUser),
    [sortedProjects, keyword, filter, currentUser],
  );

  async function handleDelete(project: Project) {
    if (!canDeleteProject) {
      toast.error('当前账号无权删除项目。');
      return;
    }
    const confirmed = await confirm({
      title: `删除项目“${project.name}”？`,
      description: '该项目下的任务、迭代和项目成员关系也会一并删除，操作后无法恢复。',
      confirmText: '删除项目',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await deleteProject(project.id);
      toast.success(`已删除项目：${project.name}`);
      reload();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : '删除项目失败');
    }
  }

  const columns: DataTableColumn<Project>[] = [
    {
      key: 'name',
      title: '项目',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (project) => (
        <div>
          <div className="font-medium">{project.name}</div>
          <div className="text-secondary" style={{ fontSize: 12 }}>
            {labelOf(PROCESS_MODE_LABELS, project.processMode)} · {project.code || '未设置代号'}
          </div>
        </div>
      ),
    },
    { key: 'owner', title: '负责人', render: (project) => project.owner || '-' },
    {
      key: 'status',
      title: '状态',
      render: (project) => (
        <StatusBadge label={labelOf(PROJECT_STATUS_LABELS, project.status)} status={project.status} />
      ),
    },
    {
      key: 'healthScore',
      title: '健康度',
      align: 'center',
      sorter: (a, b) => a.healthScore - b.healthScore,
      render: (project) => (
        <StatusBadge
          label={String(project.healthScore)}
          variant={healthVariant(project.healthScore)}
          showDot={false}
        />
      ),
    },
    {
      key: 'riskCount',
      title: '风险数',
      align: 'center',
      sorter: (a, b) => a.riskCount - b.riskCount,
      render: (project) => <span className="text-mono">{project.riskCount}</span>,
    },
    {
      key: 'progress',
      title: '进度',
      width: 180,
      sorter: (a, b) => a.progress - b.progress,
      render: (project) => <ProgressBar percent={project.progress ?? 0} height={6} />,
    },
    {
      key: 'actions',
      title: '操作',
      width: 140,
      render: (project) => (
        <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
          <button className="btn btn-text btn-xs" onClick={() => onOpen(project.id)}>
            查看
          </button>
          {canUpdateProject ? (
            <button className="btn btn-text btn-xs" onClick={() => setEditing(project)}>
              编辑
            </button>
          ) : null}
          {canDeleteProject ? (
            <button
              className="btn btn-text btn-xs"
              style={{ color: 'var(--color-red, #dc2626)' }}
              onClick={() => handleDelete(project)}
            >
              删除
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  if (loading || error) {
    return <PageState loading={loading} error={error} onRetry={reload} />;
  }

  const filterButtons: { key: ProjectFilter; label: string }[] = [
    { key: 'all', label: '全部项目' },
    { key: 'mine', label: '我的项目' },
    { key: 'risk', label: '高风险' },
    { key: 'active', label: '进行中' },
  ];

  return (
    <Panel
      title="项目驾驶舱"
      subtitle={`当前展示 ${filtered.length} / ${sortedProjects.length} 个项目`}
      toolbar={canCreateProject ? <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>新建项目</button> : undefined}
    >
      <div className="project-cockpit-toolbar">
        <div className="project-cockpit-search">
          <input
            className="form-input"
            placeholder="搜索项目..."
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>
        <div className="project-cockpit-filters">
          {filterButtons.map((item) => (
            <button
              key={item.key}
              className={`btn btn-sm ${filter === item.key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        rowKey="id"
        onRowClick={(project) => onOpen(project.id)}
        emptyText={keyword ? '没有匹配的项目。' : '暂无项目。'}
      />

      {creating && canCreateProject && (
        <CreateProjectForm
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
      {editing && canUpdateProject && (
        <EditProjectForm
          project={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </Panel>
  );
}
