import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, FolderKanban, Pencil, Plus, Search, Trash2 } from 'lucide-react';
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
import { Pagination } from '../../../components/common/Pagination';
import { Input } from '../../../components/ui';
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

const PROJECT_PAGE_SIZE = 10;

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
  const [mobilePage, setMobilePage] = useState(1);
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

  const mobilePageCount = Math.max(1, Math.ceil(filtered.length / PROJECT_PAGE_SIZE));
  useEffect(() => {
    setMobilePage(1);
  }, [keyword, filter, filtered.length]);
  useEffect(() => {
    setMobilePage((current) => Math.min(Math.max(current, 1), mobilePageCount));
  }, [mobilePageCount]);

  const mobilePaged = useMemo(() => {
    const start = (mobilePage - 1) * PROJECT_PAGE_SIZE;
    return filtered.slice(start, start + PROJECT_PAGE_SIZE);
  }, [filtered, mobilePage]);

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
      width: '34%',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (project) => (
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]"
            aria-hidden="true"
          >
            <FolderKanban size={15} />
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium">{project.name}</div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-secondary" style={{ fontSize: 12 }}>
              <span>{project.code || '未设置代号'}</span>
              <span aria-hidden="true">·</span>
              <span>{labelOf(PROCESS_MODE_LABELS, project.processMode)}</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'owner',
      title: '负责人',
      render: (project) => <span className="whitespace-nowrap">{project.owner || '-'}</span>,
    },
    {
      key: 'status',
      title: '状态',
      render: (project) => (
        <StatusBadge label={labelOf(PROJECT_STATUS_LABELS, project.status)} status={project.status} />
      ),
    },
    {
      key: 'healthScore',
      title: '健康 / 风险',
      sorter: (a, b) => a.healthScore - b.healthScore,
      render: (project) => (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusBadge
            label={String(project.healthScore)}
            variant={healthVariant(project.healthScore)}
            showDot={false}
          />
          <span className="whitespace-nowrap text-secondary">风险 {project.riskCount}</span>
        </div>
      ),
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
      width: 170,
      render: (project) => (
        <div className="flex min-w-0 items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
          <button className="btn btn-text btn-xs btn-with-icon" title="查看项目" onClick={() => onOpen(project.id)}>
            查看 <ArrowUpRight size={13} aria-hidden="true" />
          </button>
          {canUpdateProject ? (
            <button className="btn btn-text btn-xs btn-with-icon" title="编辑项目" onClick={() => setEditing(project)}>
              <Pencil size={13} aria-hidden="true" /> 编辑
            </button>
          ) : null}
          {canDeleteProject ? (
            <button
              className="btn btn-text btn-xs btn-with-icon"
              title="删除项目"
              style={{ color: 'var(--color-red, #dc2626)' }}
              onClick={() => handleDelete(project)}
            >
              <Trash2 size={13} aria-hidden="true" /> 删除
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
      title="项目"
      subtitle={`显示 ${filtered.length} / ${sortedProjects.length} 个项目`}
      toolbar={canCreateProject ? (
        <button className="btn btn-primary btn-sm btn-with-icon" onClick={() => setCreating(true)}>
          <Plus size={15} aria-hidden="true" /> 新建项目
        </button>
      ) : undefined}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3" style={{ marginBottom: 14 }}>
        <div className="input-with-icon min-w-0 flex-1" style={{ flexBasis: 260, maxWidth: 420, minHeight: 36 }}>
          <Search size={15} className="shrink-0 text-secondary" aria-hidden="true" />
          <Input
            className="w-full border-0 bg-transparent shadow-none"
            aria-label="搜索项目"
            placeholder="搜索项目..."
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1" role="group" aria-label="项目筛选">
          {filterButtons.map((item) => (
            <button
              key={item.key}
              className={`btn btn-sm ${filter === item.key ? 'btn-secondary' : 'btn-text'}`}
              aria-pressed={filter === item.key}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={filtered}
          rowKey="id"
          onRowClick={(project) => onOpen(project.id)}
          emptyText={keyword ? '没有匹配的项目。' : '暂无项目。'}
          pageSize={PROJECT_PAGE_SIZE}
        />
      </div>

      <div className="md:hidden">
        <div className="divide-y divide-[var(--border)]">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-secondary">
              {keyword ? '没有匹配的项目。' : '暂无项目。'}
            </div>
          ) : mobilePaged.map((project) => (
            <article key={project.id} className="min-w-0 py-4 first:pt-0 last:pb-0">
              <div className="flex min-w-0 items-start gap-3">
                <button
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  title={`查看项目：${project.name}`}
                  onClick={() => onOpen(project.id)}
                >
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]"
                    aria-hidden="true"
                  >
                    <FolderKanban size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-start justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">{project.name}</span>
                      <StatusBadge
                        label={labelOf(PROJECT_STATUS_LABELS, project.status)}
                        status={project.status}
                      />
                    </span>
                    <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-secondary" style={{ fontSize: 12 }}>
                      <span>{project.code || '未设置代号'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{labelOf(PROCESS_MODE_LABELS, project.processMode)}</span>
                    </span>
                    <ProgressBar percent={project.progress ?? 0} height={6} className="mt-3" />
                    <span className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-secondary" style={{ fontSize: 12 }}>
                      <span>负责人 {project.owner || '-'}</span>
                      <span>健康 {project.healthScore}</span>
                      <span>风险 {project.riskCount}</span>
                    </span>
                  </span>
                </button>
              </div>
              <div className="mt-3 flex min-w-0 items-center justify-end gap-1 border-t border-[var(--border)] pt-2" onClick={(event) => event.stopPropagation()}>
                <button className="btn btn-text btn-xs btn-with-icon" onClick={() => onOpen(project.id)}>
                  查看 <ArrowUpRight size={13} aria-hidden="true" />
                </button>
                {canUpdateProject ? (
                  <button className="btn btn-text btn-xs btn-with-icon" onClick={() => setEditing(project)}>
                    <Pencil size={13} aria-hidden="true" /> 编辑
                  </button>
                ) : null}
                {canDeleteProject ? (
                  <button
                    className="btn btn-text btn-xs btn-with-icon"
                    style={{ color: 'var(--color-red, #dc2626)' }}
                    onClick={() => handleDelete(project)}
                  >
                    <Trash2 size={13} aria-hidden="true" /> 删除
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        {filtered.length > PROJECT_PAGE_SIZE ? (
          <div className="list-pagination" data-slot="list-pagination">
            <span className="list-pagination-meta text-secondary">
              第 {(mobilePage - 1) * PROJECT_PAGE_SIZE + 1}–{Math.min(mobilePage * PROJECT_PAGE_SIZE, filtered.length)} 条，共 {filtered.length} 条
            </span>
            <Pagination page={mobilePage} pageCount={mobilePageCount} onPageChange={setMobilePage} />
          </div>
        ) : null}
      </div>

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
