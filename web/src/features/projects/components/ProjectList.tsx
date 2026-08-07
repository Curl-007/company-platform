import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      toast.error(t('features.projects.projectList.noDeletePermission'));
      return;
    }
    const confirmed = await confirm({
      title: t('features.projects.projectList.deleteConfirm', { name: project.name }),
      description: t('features.projects.projectList.deleteDesc'),
      confirmText: t('features.projects.projectList.deleteConfirmText'),
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await deleteProject(project.id);
      toast.success(t('features.projects.projectList.deleted', { name: project.name }));
      reload();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : t('features.projects.projectList.deleteFailed'));
    }
  }

  const columns: DataTableColumn<Project>[] = [
    {
      key: 'name',
      title: t('features.projects.projectList.colProject'),
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
              <span>{project.code || t('features.projects.projectList.noCode')}</span>
              <span aria-hidden="true">·</span>
              <span>{labelOf(PROCESS_MODE_LABELS, project.processMode)}</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'owner',
      title: t('features.projects.projectList.colOwner'),
      render: (project) => <span className="whitespace-nowrap">{project.owner || '-'}</span>,
    },
    {
      key: 'status',
      title: t('features.projects.projectList.colStatus'),
      render: (project) => (
        <StatusBadge label={labelOf(PROJECT_STATUS_LABELS, project.status)} status={project.status} />
      ),
    },
    {
      key: 'healthScore',
      title: t('features.projects.projectList.colHealthRisk'),
      sorter: (a, b) => a.healthScore - b.healthScore,
      render: (project) => (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusBadge
            label={String(project.healthScore)}
            variant={healthVariant(project.healthScore)}
            showDot={false}
          />
          <span className="whitespace-nowrap text-secondary">{t('features.projects.projectList.riskCount', { count: project.riskCount })}</span>
        </div>
      ),
    },
    {
      key: 'progress',
      title: t('features.projects.projectList.colProgress'),
      width: 180,
      sorter: (a, b) => a.progress - b.progress,
      render: (project) => <ProgressBar percent={project.progress ?? 0} height={6} />,
    },
    {
      key: 'actions',
      title: t('common.actions'),
      width: 170,
      render: (project) => (
        <div className="flex min-w-0 items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
          <button className="btn btn-text btn-xs btn-with-icon" title={t('features.projects.projectList.viewTitle')} onClick={() => onOpen(project.id)}>
            {t('features.projects.projectList.view')} <ArrowUpRight size={13} aria-hidden="true" />
          </button>
          {canUpdateProject ? (
            <button className="btn btn-text btn-xs btn-with-icon" title={t('features.projects.projectList.editTitle')} onClick={() => setEditing(project)}>
              <Pencil size={13} aria-hidden="true" /> {t('common.edit')}
            </button>
          ) : null}
          {canDeleteProject ? (
            <button
              className="btn btn-text btn-xs btn-with-icon"
              title={t('features.projects.projectList.deleteTitle')}
              style={{ color: 'var(--color-red, #dc2626)' }}
              onClick={() => handleDelete(project)}
            >
              <Trash2 size={13} aria-hidden="true" /> {t('common.delete')}
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
    { key: 'all', label: t('features.projects.projectList.filterAll') },
    { key: 'mine', label: t('features.projects.projectList.filterMine') },
    { key: 'risk', label: t('features.projects.projectList.filterRisk') },
    { key: 'active', label: t('features.projects.projectList.filterActive') },
  ];

  return (
    <Panel
      title={t('features.projects.projectList.title')}
      subtitle={t('features.projects.projectList.subtitle', { shown: filtered.length, total: sortedProjects.length })}
      toolbar={canCreateProject ? (
        <button className="btn btn-primary btn-sm btn-with-icon" onClick={() => setCreating(true)}>
          <Plus size={15} aria-hidden="true" /> {t('features.projects.projectList.newProject')}
        </button>
      ) : undefined}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3" style={{ marginBottom: 14 }}>
        <div className="input-with-icon min-w-0 flex-1" style={{ flexBasis: 260, maxWidth: 420, minHeight: 36 }}>
          <Search size={15} className="shrink-0 text-secondary" aria-hidden="true" />
          <Input
            className="w-full border-0 bg-transparent shadow-none"
            aria-label={t('features.projects.projectList.searchAria')}
            placeholder={t('features.projects.projectList.searchPlaceholder')}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1" role="group" aria-label={t('features.projects.projectList.filterAria')}>
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
          emptyText={keyword ? t('features.projects.projectList.noMatch') : t('features.projects.projectList.empty')}
          pageSize={PROJECT_PAGE_SIZE}
        />
      </div>

      <div className="md:hidden">
        <div className="divide-y divide-[var(--border)]">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-secondary">
              {keyword ? t('features.projects.projectList.noMatch') : t('features.projects.projectList.empty')}
            </div>
          ) : mobilePaged.map((project) => (
            <article key={project.id} className="min-w-0 py-4 first:pt-0 last:pb-0">
              <div className="flex min-w-0 items-start gap-3">
                <button
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  title={t('features.projects.projectList.viewProjectTitle', { name: project.name })}
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
                      <span>{project.code || t('features.projects.projectList.noCode')}</span>
                      <span aria-hidden="true">·</span>
                      <span>{labelOf(PROCESS_MODE_LABELS, project.processMode)}</span>
                    </span>
                    <ProgressBar percent={project.progress ?? 0} height={6} className="mt-3" />
                    <span className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-secondary" style={{ fontSize: 12 }}>
                      <span>{t('features.projects.projectList.mobileOwner', { owner: project.owner || '-' })}</span>
                      <span>{t('features.projects.projectList.mobileHealth', { score: project.healthScore })}</span>
                      <span>{t('features.projects.projectList.mobileRisk', { count: project.riskCount })}</span>
                    </span>
                  </span>
                </button>
              </div>
              <div className="mt-3 flex min-w-0 items-center justify-end gap-1 border-t border-[var(--border)] pt-2" onClick={(event) => event.stopPropagation()}>
                <button className="btn btn-text btn-xs btn-with-icon" onClick={() => onOpen(project.id)}>
                  {t('features.projects.projectList.view')} <ArrowUpRight size={13} aria-hidden="true" />
                </button>
                {canUpdateProject ? (
                  <button className="btn btn-text btn-xs btn-with-icon" onClick={() => setEditing(project)}>
                    <Pencil size={13} aria-hidden="true" /> {t('common.edit')}
                  </button>
                ) : null}
                {canDeleteProject ? (
                  <button
                    className="btn btn-text btn-xs btn-with-icon"
                    style={{ color: 'var(--color-red, #dc2626)' }}
                    onClick={() => handleDelete(project)}
                  >
                    <Trash2 size={13} aria-hidden="true" /> {t('common.delete')}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        {filtered.length > PROJECT_PAGE_SIZE ? (
          <div className="list-pagination" data-slot="list-pagination">
            <span className="list-pagination-meta text-secondary">
              {t('features.projects.projectList.pageRange', {
                start: (mobilePage - 1) * PROJECT_PAGE_SIZE + 1,
                end: Math.min(mobilePage * PROJECT_PAGE_SIZE, filtered.length),
                total: filtered.length,
              })}
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
