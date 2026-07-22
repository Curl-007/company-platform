import Panel from '../../../components/common/Panel';
import ProgressBar from '../../../components/common/ProgressBar';
import type { RequirementProgress } from '../../../types';

export default function RequirementProgressPanel({ items }: { items: RequirementProgress[] }) {
  return (
    <Panel title="需求推进" subtitle="跟踪进行中的需求完成情况">
      {items.length === 0 ? (
        <p className="body-text" style={{ margin: 0 }}>当前没有进行中的需求。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {items.map((item) => (
            <div key={item.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span className="font-medium" style={{ minWidth: 0 }}>{item.title}</span>
                <span className="text-secondary text-mono">{item.completion}%</span>
              </div>
              <div className="text-secondary" style={{ fontSize: 12, marginBottom: 4 }}>{item.projectName}</div>
              <ProgressBar percent={item.completion} showPercent={false} height={6} />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
