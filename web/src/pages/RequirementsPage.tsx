import { useState } from 'react';
import {
  fetchRequirements,
  fetchProjects,
  createRequirement,
  fetchCompletionScore,
  type RequirementFilters,
} from '../services/resources';
import { useAsync } from '../hooks/useAsync';
import { ApiError } from '../services/api';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import Overlay from '../components/common/Overlay';
import FilterBar from '../components/common/FilterBar';
import DataTable, { type DataTableColumn } from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import ProgressBar from '../components/common/ProgressBar';
import type { Requirement, Project, CompletionScore } from '../types';

const STATUS_OPTIONS = ['draft', 'review', 'approved', 'in_progress', 'done', 'rejected'];
const PRIORITY_OPTIONS = ['P0', 'P1', 'P2', 'P3', 'high', 'medium', 'low'];

function RequirementsPage() {
  const [filters, setFilters] = useState<RequirementFilters>({});
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Requirement | null>(null);

  const projectsState = useAsync<Project[]>(fetchProjects, []);
  const {
    data,
    loading,
    error,
    reload,
  } = useAsync<Requirement[]>(
    () => fetchRequirements(filters),
    [filters.keyword, filters.status, filters.priority, filters.projectId],
  );

  const projects = projectsState.data ?? [];
  const requirements = data ?? [];

  function setFilter(key: keyof RequirementFilters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  }

  const columns: DataTableColumn<Requirement>[] = [
    { key: 'id', title: 'ID', width: 90, render: (r) => <span className="text-mono">{r.id}</span> },
    { key: 'title', title: 'Requirement', render: (r) => <span className="font-medium">{r.title}</span> },
    { key: 'priority', title: 'Priority', align: 'center', render: (r) => <StatusBadge label={r.priority} status={r.priority} showDot={false} /> },
    { key: 'status', title: 'Status', render: (r) => <StatusBadge label={r.status} status={r.status} /> },
    { key: 'owner', title: 'Owner', render: (r) => r.owner || '—' },
    { key: 'completion', title: 'Completion', width: 160, render: (r) => <ProgressBar percent={r.completion ?? 0} height={6} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Requirements"
        description="Track requirements, priorities, and completion across projects."
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
            + New Requirement
          </button>
        }
      />

      <Panel title="Requirement Pool" subtitle={`${requirements.length} requirements`}>
        <FilterBar trailing={
          <button className="btn btn-secondary btn-sm" onClick={reload}>刷新</button>
        }>
          <input
            className="form-input filter-search"
            placeholder="搜索标题…"
            value={filters.keyword ?? ''}
            onChange={(event) => setFilter('keyword', event.target.value)}
          />
          <select className="form-select" value={filters.status ?? ''} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">全部状态</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="form-select" value={filters.priority ?? ''} onChange={(e) => setFilter('priority', e.target.value)}>
            <option value="">全部优先级</option>
            {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="form-select filter-project" value={filters.projectId ?? ''} onChange={(e) => setFilter('projectId', e.target.value)}>
            <option value="">全部项目</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </FilterBar>

        <div className="filter-bar-divider" />

        {loading || error ? (
          <PageState loading={loading} error={error} onRetry={reload} />
        ) : (
          <DataTable
            columns={columns}
            data={requirements}
            rowKey="id"
            onRowClick={setSelected}
            emptyText="No requirements match the current filters."
          />
        )}
      </Panel>

      {creating && (
        <CreateRequirementForm
          projects={projects}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      )}

      {selected && (
        <RequirementDetail requirement={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create form (modal-style overlay)
// ---------------------------------------------------------------------------

function CreateRequirementForm({
  projects,
  onClose,
  onCreated,
}: {
  projects: Project[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [owner, setOwner] = useState('');
  const [priority, setPriority] = useState('P1');
  const [description, setDescription] = useState('');
  const [criteria, setCriteria] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!title.trim()) {
      setFormError('Title is required.');
      return;
    }
    if (!projectId) {
      setFormError('Please select a project.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await createRequirement({
        title: title.trim(),
        projectId,
        owner: owner.trim() || undefined,
        priority,
        description: description.trim() || undefined,
        acceptanceCriteria: criteria
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      });
      onCreated();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create requirement');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title="New Requirement" subtitle="Create a requirement and link it to a project">
        {formError && <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div>}
        <div className="form-group">
          <label className="form-label">Title</label>
          <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Requirement title" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Project</label>
            <select className="form-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Select a project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Priority</label>
            <select className="form-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Owner</label>
          <input className="form-input" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Owner name" />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea className="form-textarea" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
        <div className="form-group">
          <label className="form-label">Acceptance Criteria (one per line)</label>
          <textarea className="form-textarea" value={criteria} onChange={(e) => setCriteria(e.target.value)} rows={3} />
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}

// ---------------------------------------------------------------------------
// Detail (acceptance criteria + completion score)
// ---------------------------------------------------------------------------

function RequirementDetail({ requirement, onClose }: { requirement: Requirement; onClose: () => void }) {
  const { data, loading, error } = useAsync<CompletionScore>(
    () => fetchCompletionScore(requirement.id),
    [requirement.id],
  );

  return (
    <Overlay onClose={onClose}>
      <Panel title={requirement.title} subtitle={`${requirement.id} · ${requirement.owner || 'Unassigned'}`}>
        <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
          <StatusBadge label={requirement.status} status={requirement.status} />
          <StatusBadge label={requirement.priority} status={requirement.priority} showDot={false} />
        </div>

        {requirement.description && <p className="body-text">{requirement.description}</p>}

        <div className="section-title" style={{ marginTop: 12 }}>Acceptance Criteria</div>
        {requirement.acceptanceCriteria.length === 0 ? (
          <p className="text-secondary" style={{ margin: '4px 0' }}>None defined.</p>
        ) : (
          <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
            {requirement.acceptanceCriteria.map((c, index) => (
              <li key={index} className="body-text" style={{ marginBottom: 4 }}>{c}</li>
            ))}
          </ul>
        )}

        <div className="section-title" style={{ marginTop: 16 }}>Completion Score</div>
        {loading ? (
          <p className="text-secondary">Calculating…</p>
        ) : error ? (
          <p className="form-error">{error}</p>
        ) : data ? (
          <div className="metric-grid" style={{ marginTop: 8 }}>
            <ScoreCard label="Overall" value={data.score} />
            <ScoreCard label="Task Score" value={data.taskScore} />
            <ScoreCard label="Test Score" value={data.testScore} />
            <ScoreCard label="Declared" value={data.declaredCompletion} />
          </div>
        ) : null}

        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
        </div>
      </Panel>
    </Overlay>
  );
}

function ScoreCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-card">
      <div className="metric-card-label">{label}</div>
      <div className="metric-card-value">{value}%</div>
    </div>
  );
}

export default RequirementsPage;
