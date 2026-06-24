import { useState } from 'react';
import {
  fetchProjects,
  fetchProject,
  fetchProjectKanban,
  updateProjectStatus,
} from '../services/resources';
import { useAsync } from '../hooks/useAsync';
import { ApiError } from '../services/api';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import DataTable, { type DataTableColumn } from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import ProgressBar from '../components/common/ProgressBar';
import type { Project, ProjectDetail, KanbanColumn, Task } from '../types';

// Must match the backend ALLOWED_STATUSES in api/server.js
// (PATCH /api/projects/:id/status). Kept in this order so the dropdown reads
// as a natural project lifecycle.
const PROJECT_STATUSES = ['planning', 'development', 'testing', 'acceptance', 'release', 'closed'];

function healthVariant(score: number): 'success' | 'warning' | 'risk' {
  if (score >= 75) return 'success';
  if (score >= 50) return 'warning';
  return 'risk';
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

function ProjectList({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, loading, error, reload } = useAsync<Project[]>(fetchProjects, []);
  const [keyword, setKeyword] = useState('');

  const projects = data ?? [];
  const filtered = projects.filter((project) =>
    project.name.toLowerCase().includes(keyword.trim().toLowerCase()),
  );

  const columns: DataTableColumn<Project>[] = [
    {
      key: 'name',
      title: 'Project',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (project) => <span className="font-medium">{project.name}</span>,
    },
    { key: 'owner', title: 'Owner', render: (p) => p.owner || '—' },
    {
      key: 'status',
      title: 'Status',
      render: (p) => <StatusBadge label={p.status} status={p.status} />,
    },
    {
      key: 'healthScore',
      title: 'Health',
      align: 'center',
      sorter: (a, b) => a.healthScore - b.healthScore,
      render: (p) => <StatusBadge label={String(p.healthScore)} variant={healthVariant(p.healthScore)} showDot={false} />,
    },
    {
      key: 'riskCount',
      title: 'Risks',
      align: 'center',
      sorter: (a, b) => a.riskCount - b.riskCount,
      render: (p) => <span className="text-mono">{p.riskCount}</span>,
    },
    {
      key: 'progress',
      title: 'Progress',
      width: 180,
      sorter: (a, b) => a.progress - b.progress,
      render: (p) => <ProgressBar percent={p.progress ?? 0} height={6} />,
    },
  ];

  if (loading || error) {
    return <PageState loading={loading} error={error} onRetry={reload} />;
  }

  return (
    <Panel
      title="All Projects"
      subtitle={`${filtered.length} of ${projects.length} projects`}
      toolbar={
        <input
          className="form-input"
          style={{ maxWidth: 240 }}
          placeholder="Search projects…"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
      }
    >
      <DataTable
        columns={columns}
        data={filtered}
        rowKey="id"
        onRowClick={(project) => onOpen(project.id)}
        emptyText={keyword ? 'No projects match your search.' : 'No projects yet.'}
      />
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Detail view
// ---------------------------------------------------------------------------

type DetailTab = 'overview' | 'wbs' | 'kanban';

function ProjectDetailView({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, loading, error, reload } = useAsync<ProjectDetail>(() => fetchProject(id), [id]);
  const [tab, setTab] = useState<DetailTab>('overview');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleStatusChange(next: string) {
    setStatus(next);
    if (!next) return;
    setSaving(true);
    setActionError(null);
    try {
      await updateProjectStatus(id, next);
      reload();
    } catch (err: unknown) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to update status');
    } finally {
      setSaving(false);
      setStatus('');
    }
  }

  if (loading || error || !data) {
    return (
      <>
        <button className="btn btn-text btn-sm" onClick={onBack} style={{ marginBottom: 12 }}>← Back to projects</button>
        <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />
      </>
    );
  }

  const project = data;

  return (
    <div>
      <button className="btn btn-text btn-sm" onClick={onBack} style={{ marginBottom: 12 }}>← Back to projects</button>

      <Panel
        title={project.name}
        subtitle={`Owner: ${project.owner} · Mode: ${project.processMode}`}
        toolbar={
          <div className="flex items-center gap-2">
            <StatusBadge label={project.status} status={project.status} />
            <select
              className="form-select"
              style={{ maxWidth: 180 }}
              value={status}
              disabled={saving}
              onChange={(event) => handleStatusChange(event.target.value)}
            >
              <option value="">Change status…</option>
              {PROJECT_STATUSES.filter((s) => s !== project.status).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        }
      >
        {actionError && <div className="form-error" style={{ marginBottom: 8 }}>{actionError}</div>}
        <div className="metric-grid" style={{ marginBottom: 0 }}>
          <div className="metric-card">
            <div className="metric-card-label">Health Score</div>
            <div className="metric-card-value">{project.healthScore}</div>
          </div>
          <div className="metric-card">
            <div className="metric-card-label">Progress</div>
            <div className="metric-card-value">{project.progress}%</div>
          </div>
          <div className="metric-card">
            <div className="metric-card-label">Open Risks</div>
            <div className="metric-card-value">{project.riskCount}</div>
          </div>
          <div className="metric-card">
            <div className="metric-card-label">Tasks</div>
            <div className="metric-card-value">{project.tasks.length}</div>
          </div>
        </div>
      </Panel>

      <div className="nav-tabs" style={{ margin: '16px 0' }}>
        {(['overview', 'wbs', 'kanban'] as DetailTab[]).map((key) => (
          <button
            key={key}
            className={`nav-tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {key === 'overview' ? 'Overview' : key === 'wbs' ? 'WBS' : 'Kanban'}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab project={project} />}
      {tab === 'wbs' && <WbsTab tasks={project.tasks} />}
      {tab === 'kanban' && <KanbanTab projectId={id} />}
    </div>
  );
}

function OverviewTab({ project }: { project: ProjectDetail }) {
  return (
    <div className="grid-2">
      <Panel title="Milestones">
        {project.milestones.length === 0 ? (
          <p className="body-text" style={{ margin: 0 }}>No milestones defined.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {project.milestones.map((m, index) => (
              <div key={index} className="flex items-center justify-between">
                <span className="font-medium">{m.name}</span>
                <span className="flex items-center gap-2">
                  <span className="text-secondary text-mono">{m.date}</span>
                  <StatusBadge label={m.status} status={m.status} />
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Sprints">
        {project.sprints.length === 0 ? (
          <p className="body-text" style={{ margin: 0 }}>No sprints for this project.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {project.sprints.map((sprint) => (
              <div key={sprint.id} className="flex items-center justify-between">
                <span>
                  <span className="font-medium">{sprint.name}</span>
                  <span className="text-secondary" style={{ marginLeft: 8 }}>{sprint.goal}</span>
                </span>
                <StatusBadge label={sprint.status} status={sprint.status} />
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function WbsTab({ tasks }: { tasks: Task[] }) {
  const sorted = [...tasks].sort((a, b) => a.wbsCode.localeCompare(b.wbsCode, undefined, { numeric: true }));
  const columns: DataTableColumn<Task>[] = [
    { key: 'wbsCode', title: 'WBS', width: 80, render: (t) => <span className="text-mono">{t.wbsCode}</span> },
    { key: 'title', title: 'Task', render: (t) => <span className="font-medium">{t.title}</span> },
    { key: 'owner', title: 'Owner', render: (t) => t.owner || '—' },
    { key: 'status', title: 'Status', render: (t) => <StatusBadge label={t.statusText || t.status} status={t.status} /> },
    { key: 'estimatedHours', title: 'Est. h', align: 'right', render: (t) => t.estimatedHours },
    { key: 'progress', title: 'Progress', width: 160, render: (t) => <ProgressBar percent={t.progress ?? 0} height={6} /> },
  ];
  return (
    <Panel title="Work Breakdown Structure" subtitle={`${tasks.length} tasks`}>
      <DataTable columns={columns} data={sorted} rowKey="id" emptyText="No WBS tasks for this project." />
    </Panel>
  );
}

function KanbanTab({ projectId }: { projectId: string }) {
  const { data, loading, error, reload } = useAsync<KanbanColumn[]>(() => fetchProjectKanban(projectId), [projectId]);

  if (loading || error || !data) {
    return <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />;
  }

  return (
    <div className="kanban-board">
      {data.map((column) => (
        <div key={column.id} className="panel kanban-column">
          <div className="panel-header">
            <div className="panel-header-left">
              <div className="panel-title" style={{ textTransform: 'capitalize' }}>{column.title}</div>
            </div>
            <span className="tag">{column.tasks.length}</span>
          </div>
          <div className="panel-body">
            {column.tasks.length === 0 ? (
              <p className="text-secondary" style={{ fontSize: 13, margin: 0 }}>No cards</p>
            ) : (
              column.tasks.map((task) => (
                <div key={task.id} className="card kanban-card">
                  <div className="font-medium" style={{ fontSize: 13 }}>{task.title}</div>
                  <div className="kanban-card-meta">
                    <span className="text-secondary" style={{ fontSize: 12 }}>{task.owner || '—'}</span>
                    <span className="text-mono text-secondary" style={{ fontSize: 12 }}>{task.progress}%</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function ProjectsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div>
      <PageHeader title="Projects" description="Manage projects, work breakdown, and delivery boards." />
      {selectedId ? (
        <ProjectDetailView id={selectedId} onBack={() => setSelectedId(null)} />
      ) : (
        <ProjectList onOpen={setSelectedId} />
      )}
    </div>
  );
}

export default ProjectsPage;
