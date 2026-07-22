import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import {
  DEFECT_SEVERITY_LABELS,
  DEFECT_STATUS_LABELS,
  labelOf,
} from '../../../constants/enums';
import type { DashboardData } from '../../../types';

type DefectItem = NonNullable<DashboardData['myDefects']>[number];

export default function MyWorkDefectsPanel({ defects }: { defects: DefectItem[] }) {
  return (
    <Panel title="我的缺陷" subtitle={`共 ${defects.length} 条`}>
      <div style={{ display: 'grid', gap: 12 }}>
        {defects.map((item) => (
          <div key={item.id} className="panel" style={{ margin: 0 }}>
            <div className="panel-body">
              <div className="flex items-center justify-between" style={{ gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div className="font-medium">{item.title}</div>
                  <div className="text-secondary" style={{ marginTop: 4 }}>{item.id} · {item.projectId}</div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={item.severity} label={labelOf(DEFECT_SEVERITY_LABELS, item.severity)} showDot={false} />
                  <StatusBadge status={item.status} label={labelOf(DEFECT_STATUS_LABELS, item.status)} />
                </div>
              </div>
            </div>
          </div>
        ))}
        {defects.length === 0 ? <div className="empty-state-desc">当前没有指派给你的缺陷。</div> : null}
      </div>
    </Panel>
  );
}
