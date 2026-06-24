import { useState } from 'react';
import {
  fetchTests,
  fetchDefects,
  fetchProjects,
  createDefect,
  updateDefectStatus,
  type DefectFilters,
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
import type { TestCase, Defect, Project } from '../types';

const DEFECT_STATUSES = ['open', 'in_progress', 'resolved', 'closed', 'reopened'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];

type Tab = 'cases' | 'defects';

function TestingPage() {
  const [tab, setTab] = useState<Tab>('cases');
  return (
    <div>
      <PageHeader title="Testing" description="Test case coverage and defect tracking." />
      <div className="nav-tabs" style={{ marginBottom: 16 }}>
        <button className={`nav-tab ${tab === 'cases' ? 'active' : ''}`} onClick={() => setTab('cases')}>Test Cases</button>
        <button className={`nav-tab ${tab === 'defects' ? 'active' : ''}`} onClick={() => setTab('defects')}>Defects</button>
      </div>
      {tab === 'cases' ? <TestCasesTab /> : <DefectsTab />}
    </div>
  );
}

function passRate(test: TestCase): number {
  return test.totalCases > 0 ? Math.round((test.passedCases / test.totalCases) * 100) : 0;
}

function TestCasesTab() {
  const { data, loading, error, reload } = useAsync<TestCase[]>(fetchTests, []);
  const tests = data ?? [];

  const columns: DataTableColumn<TestCase>[] = [
    { key: 'name', title: 'Test Suite', render: (t) => <span className="font-medium">{t.name}</span> },
    { key: 'owner', title: 'Owner', render: (t) => t.owner || '—' },
    { key: 'status', title: 'Status', render: (t) => <StatusBadge label={t.status} status={t.status} /> },
    { key: 'total', title: 'Total', align: 'right', render: (t) => t.totalCases },
    { key: 'passed', title: 'Passed', align: 'right', render: (t) => <span style={{ color: 'var(--color-green, #16a34a)' }}>{t.passedCases}</span> },
    { key: 'failed', title: 'Failed', align: 'right', render: (t) => <span style={{ color: 'var(--color-red, #dc2626)' }}>{t.failedCases}</span> },
    { key: 'blocked', title: 'Blocked', align: 'right', render: (t) => t.blockedCases },
    { key: 'rate', title: 'Pass Rate', width: 160, sorter: (a, b) => passRate(a) - passRate(b), render: (t) => <ProgressBar percent={passRate(t)} height={6} /> },
  ];

  if (loading || error) return <PageState loading={loading} error={error} onRetry={reload} />;

  return (
    <Panel title="Test Suites" subtitle={`${tests.length} suites`}>
      <DataTable columns={columns} data={tests} rowKey="id" emptyText="No test suites recorded yet." />
    </Panel>
  );
}

function DefectsTab() {
  const [filters, setFilters] = useState<DefectFilters>({});
  const [creating, setCreating] = useState(false);
  const projectsState = useAsync<Project[]>(fetchProjects, []);
  const { data, loading, error, reload } = useAsync<Defect[]>(
    () => fetchDefects(filters),
    [filters.keyword, filters.status, filters.severity, filters.projectId],
  );
  const defects = data ?? [];
  const projects = projectsState.data ?? [];

  function setFilter(key: keyof DefectFilters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  }

  async function changeStatus(defect: Defect, status: string) {
    try {
      await updateDefectStatus(defect.id, status);
      reload();
    } catch {
      reload();
    }
  }

  const columns: DataTableColumn<Defect>[] = [
    { key: 'id', title: 'ID', width: 90, render: (d) => <span className="text-mono">{d.id}</span> },
    { key: 'title', title: 'Defect', render: (d) => <span className="font-medium">{d.title}</span> },
    { key: 'severity', title: 'Severity', render: (d) => <StatusBadge label={d.severity} status={d.severity} showDot={false} /> },
    { key: 'assignee', title: 'Assignee', render: (d) => d.assignee || '—' },
    {
      key: 'status',
      title: 'Status',
      width: 160,
      render: (d) => (
        <select
          className="form-select"
          value={d.status}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => changeStatus(d, event.target.value)}
        >
          {DEFECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      ),
    },
  ];

  return (
    <Panel title="Defects" subtitle={`${defects.length} defects`}>
      <FilterBar trailing={
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ 新建缺陷</button>
      }>
        <input className="form-input filter-search" placeholder="搜索…" value={filters.keyword ?? ''} onChange={(e) => setFilter('keyword', e.target.value)} />
        <select className="form-select" value={filters.severity ?? ''} onChange={(e) => setFilter('severity', e.target.value)}>
          <option value="">全部严重度</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="form-select" value={filters.status ?? ''} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">全部状态</option>
          {DEFECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </FilterBar>

      <div className="filter-bar-divider" />

      {loading || error ? (
        <PageState loading={loading} error={error} onRetry={reload} />
      ) : (
        <DataTable columns={columns} data={defects} rowKey="id" emptyText="No defects match the current filters." />
      )}

      {creating && (
        <CreateDefectForm
          projects={projects}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
    </Panel>
  );
}

function CreateDefectForm({
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
  const [severity, setSeverity] = useState('medium');
  const [assignee, setAssignee] = useState('');
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
      await createDefect({ title: title.trim(), projectId, severity, assignee: assignee.trim() || undefined });
      onCreated();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create defect');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title="New Defect" subtitle="Log a defect against a project">
        {formError && <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div>}
        <div className="form-group">
          <label className="form-label">Title</label>
          <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Defect summary" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Project</label>
            <select className="form-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Select…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Severity</label>
            <select className="form-select" value={severity} onChange={(e) => setSeverity(e.target.value)}>
              {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Assignee</label>
          <input className="form-input" value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Assignee name" />
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>{submitting ? 'Creating…' : 'Create'}</button>
        </div>
      </Panel>
    </Overlay>
  );
}

export default TestingPage;
