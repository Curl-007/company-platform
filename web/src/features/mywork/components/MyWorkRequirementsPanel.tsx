import Panel from '../../../components/common/Panel';
import ProgressBar from '../../../components/common/ProgressBar';
import type { DashboardData } from '../../../types';

type RequirementProgressItem = DashboardData['requirementProgress'][number];

export default function MyWorkRequirementsPanel({ items }: { items: RequirementProgressItem[] }) {
  return (
    <Panel title="我的需求" subtitle={`共 ${items.length} 条`}>
      <div style={{ display: 'grid', gap: 12 }}>
        {items.map((item) => (
          <div key={item.id} className="panel" style={{ margin: 0 }}>
            <div className="panel-body">
              <div className="flex items-center justify-between" style={{ gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div className="font-medium">{item.title}</div>
                  <div className="text-secondary" style={{ marginTop: 4 }}>{item.projectName}</div>
                </div>
                <div style={{ minWidth: 180 }}>
                  <ProgressBar percent={item.completion} height={6} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
