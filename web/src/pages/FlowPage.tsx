import { Check } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import StatusBadge from '../components/common/StatusBadge';
import DataTable, { type DataTableColumn } from '../components/common/DataTable';

// ---------------------------------------------------------------------------
// Flow stages
// ---------------------------------------------------------------------------

const FLOW_STAGES = [
  '立项', '需求', '设计', '开发', '联调', '测试', '验收', '发布', '运维', '复盘',
];

// ---------------------------------------------------------------------------
// Process gates (static data — could be replaced with API later)
// ---------------------------------------------------------------------------

interface ProcessGate {
  node: string;
  input: string;
  output: string;
  approver: string;
  status: string;
}

const GATES: ProcessGate[] = [
  { node: '立项', input: '商业论证 / 可行性报告', output: '立项批准书', approver: 'PMO', status: 'completed' },
  { node: '需求', input: '立项批准书', output: '需求规格说明书 (SRS)', approver: '产品经理', status: 'completed' },
  { node: '设计', input: 'SRS', output: '设计文档 / 原型', approver: '技术负责人', status: 'completed' },
  { node: '开发', input: '设计文档', output: '可运行代码', approver: '技术负责人', status: 'in_progress' },
  { node: '联调', input: '各模块代码', output: '联调报告', approver: '开发团队', status: 'pending' },
  { node: '测试', input: '联调通过版本', output: '测试报告', approver: 'QA 负责人', status: 'pending' },
  { node: '验收', input: '测试报告', output: '验收报告', approver: '客户 / PM', status: 'pending' },
  { node: '发布', input: '验收通过', output: '发布记录', approver: '运维负责人', status: 'pending' },
  { node: '运维', input: '发布版本', output: '运维日志', approver: '运维团队', status: 'pending' },
  { node: '复盘', input: '运维数据', output: '复盘报告', approver: '全员', status: 'pending' },
];

const gateColumns: DataTableColumn<ProcessGate>[] = [
  {
    key: 'node',
    title: '节点',
    render: (g) => <span className="font-medium">{g.node}</span>,
  },
  {
    key: 'input',
    title: '输入',
    render: (g) => g.input,
  },
  {
    key: 'output',
    title: '输出',
    render: (g) => g.output,
  },
  {
    key: 'approver',
    title: '审批人',
    render: (g) => g.approver || '—',
  },
  {
    key: 'status',
    title: '状态',
    render: (g) => <StatusBadge label={g.status} status={g.status} />,
  },
];

// ---------------------------------------------------------------------------
// Sprint info (static placeholder — could be replaced with API later)
// ---------------------------------------------------------------------------

interface SprintInfo {
  name: string;
  goal: string;
  status: string;
  startDate: string;
  endDate: string;
}

const SPRINTS: SprintInfo[] = [
  { name: 'Sprint 1', goal: '核心模块开发', status: 'completed', startDate: '2025-01-06', endDate: '2025-01-19' },
  { name: 'Sprint 2', goal: '集成联调', status: 'in_progress', startDate: '2025-01-20', endDate: '2025-02-02' },
  { name: 'Sprint 3', goal: '测试与修复', status: 'pending', startDate: '2025-02-03', endDate: '2025-02-16' },
];

const sprintColumns: DataTableColumn<SprintInfo>[] = [
  {
    key: 'name',
    title: '迭代',
    render: (s) => <span className="font-medium">{s.name}</span>,
  },
  {
    key: 'goal',
    title: '目标',
    render: (s) => s.goal,
  },
  {
    key: 'status',
    title: '状态',
    render: (s) => <StatusBadge label={s.status} status={s.status} />,
  },
  {
    key: 'startDate',
    title: '开始',
    render: (s) => <span className="text-mono">{s.startDate}</span>,
  },
  {
    key: 'endDate',
    title: '结束',
    render: (s) => <span className="text-mono">{s.endDate}</span>,
  },
];

// ---------------------------------------------------------------------------
// Flow strip visualization
// ---------------------------------------------------------------------------

function FlowStrip() {
  const currentStageIndex = 3; // "开发" is in_progress

  return (
    <div className="flow-stepper">
      {FLOW_STAGES.map((stage, index) => {
        const state = index < currentStageIndex ? 'done' : index === currentStageIndex ? 'current' : 'pending';
        return (
          <div key={stage} className={`flow-step flow-step-${state}`}>
            <div className="flow-step-node">
              {state === 'done' ? <Check size={14} strokeWidth={3} /> : index + 1}
            </div>
            <span className="flow-step-label">{stage}</span>
            {index < FLOW_STAGES.length - 1 && (
              <div className={`flow-step-connector ${index < currentStageIndex ? 'filled' : ''}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function FlowPage() {
  return (
    <div>
      <PageHeader title="研发流程" description="端到端研发流程可视化，包含流程节点、门禁与迭代信息。" />

      <Panel title="研发流程" subtitle="立项 → 需求 → 设计 → 开发 → 联调 → 测试 → 验收 → 发布 → 运维 → 复盘">
        <FlowStrip />
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20, marginTop: 20, alignItems: 'start' }}>
        <Panel title="流程门禁" subtitle="各节点的输入、输出与审批要求">
          <DataTable
            columns={gateColumns}
            data={GATES}
            rowKey="node"
            emptyText="暂无流程门禁数据。"
          />
        </Panel>

        <Panel title="迭代计划" subtitle="当前项目迭代安排">
          <DataTable
            columns={sprintColumns}
            data={SPRINTS}
            rowKey="name"
            emptyText="暂无迭代安排。"
          />
        </Panel>
      </div>
    </div>
  );
}

export default FlowPage;
