import { useState } from 'react';
import { fetchOrganization } from '../services/resources';
import { useAsync } from '../hooks/useAsync';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import DataTable, { type DataTableColumn } from '../components/common/DataTable';
import ProgressBar from '../components/common/ProgressBar';
import type { Organization, Department, Person } from '../types';

// ---------------------------------------------------------------------------
// Department tree
// ---------------------------------------------------------------------------

function DepartmentTree({
  departments,
  selectedId,
  onSelect,
}: {
  departments: Department[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button
        className={`btn btn-sm ${selectedId === null ? 'btn-primary' : 'btn-text'}`}
        onClick={() => onSelect(null)}
        style={{ justifyContent: 'flex-start', textAlign: 'left' }}
      >
        全部部门
      </button>
      {departments.map((dept) => (
        <button
          key={dept.id}
          className={`btn btn-sm ${selectedId === dept.id ? 'btn-primary' : 'btn-text'}`}
          onClick={() => onSelect(dept.id)}
          style={{ justifyContent: 'flex-start', textAlign: 'left', display: 'block' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <span className="font-medium">{dept.name}</span>
            <span className="text-secondary text-mono" style={{ fontSize: 12 }}>{dept.members}人</span>
          </div>
          <div style={{ marginTop: 4 }}>
            <ProgressBar percent={dept.load ?? 0} showPercent={false} height={4} />
          </div>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// People table
// ---------------------------------------------------------------------------

interface PersonWithDept extends Person {
  departmentName: string;
  load: number;
}

const peopleColumns: DataTableColumn<PersonWithDept>[] = [
  {
    key: 'name',
    title: '姓名',
    sorter: (a, b) => a.name.localeCompare(b.name),
    render: (p) => <span className="font-medium">{p.name}</span>,
  },
  {
    key: 'role',
    title: '角色',
    render: (p) => p.role || '—',
  },
  {
    key: 'departmentName',
    title: '部门',
    render: (p) => p.departmentName || '—',
  },
  {
    key: 'activeProjects',
    title: '参与项目',
    align: 'center',
    sorter: (a, b) => a.activeProjects - b.activeProjects,
    render: (p) => <span className="text-mono">{p.activeProjects}</span>,
  },
  {
    key: 'load',
    title: '负载',
    width: 160,
    sorter: (a, b) => a.load - b.load,
    render: (p) => <ProgressBar percent={p.load ?? 0} height={6} />,
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function OrganizationPage() {
  const { data, loading, error, reload } = useAsync<Organization>(fetchOrganization, []);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);

  if (loading || error || !data) {
    return (
      <div>
        <PageHeader title="组织架构" description="查看部门结构、人员分配与资源负载。" />
        <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />
      </div>
    );
  }

  const { departments, people } = data;

  const deptMap = new Map(departments.map((d) => [d.id, d]));

  const peopleWithDept: PersonWithDept[] = people.map((person) => {
    const dept = deptMap.get(person.departmentId);
    return {
      ...person,
      departmentName: dept?.name ?? '—',
      load: dept?.load ?? 0,
    };
  });

  const filtered = selectedDeptId
    ? peopleWithDept.filter((p) => p.departmentId === selectedDeptId)
    : peopleWithDept;

  const selectedDept = selectedDeptId ? deptMap.get(selectedDeptId) : null;

  return (
    <div>
      <PageHeader title="组织架构" description="查看部门结构、人员分配与资源负载。" />

      <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr)', gap: 20, alignItems: 'start' }} className="org-layout">
        <Panel title="部门" subtitle={`${departments.length} 个部门`}>
          <DepartmentTree
            departments={departments}
            selectedId={selectedDeptId}
            onSelect={setSelectedDeptId}
          />
        </Panel>

        <Panel
          title={selectedDept ? selectedDept.name : '全部人员'}
          subtitle={selectedDept ? `负责人: ${selectedDept.lead} · ${filtered.length} 人` : `共 ${filtered.length} 人`}
        >
          {selectedDept && selectedDept.responsibilities.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="section-title">职责范围</div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {selectedDept.responsibilities.map((r, i) => (
                  <li key={i} className="body-text" style={{ marginBottom: 2 }}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          <DataTable
            columns={peopleColumns}
            data={filtered}
            rowKey="id"
            emptyText="该部门暂无人员。"
          />
        </Panel>
      </div>
    </div>
  );
}

export default OrganizationPage;
