import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot } from 'lucide-react';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import type { Build, Product, Project } from '../../../types';
import {
  buildRecords,
  formatDate,
  statusLabel,
  type DeliveryRecord,
  type StageTone,
} from '../deliveryPageModel';

export default function DeliveryOverview({
  pipelineStages,
  builds,
  projects,
  products,
  releaseBuildIds,
  candidateCount,
  canManageDelivery,
  onOpenRecord,
  onCreateRelease,
}: {
  pipelineStages: Array<{ id: string; label: string; tone: StageTone; records: DeliveryRecord[] }>;
  builds: Build[];
  projects: Project[];
  products: Product[];
  releaseBuildIds: Set<string | null | undefined>;
  candidateCount: number;
  canManageDelivery: boolean;
  onOpenRecord: (record: DeliveryRecord | null) => void;
  onCreateRelease: () => void;
}) {
  return (
    <div className="delivery-overview-grid">
      <Panel title="交付流水线" subtitle="参考 Glass UI 的 Pipeline 阶段式视图，按构建到发布展示当前流转。">
        <div className="delivery-pipeline">
          {pipelineStages.map((stage, index) => (
            <div className={`delivery-stage ${stage.tone}`} key={stage.id}>
              <div className="delivery-stage-head">
                <span className="delivery-stage-icon">
                  {stage.tone === 'done' ? <CheckCircle2 size={16} /> : stage.tone === 'risk' ? <AlertTriangle size={16} /> : <CircleDot size={16} />}
                </span>
                <div>
                  <strong>{stage.label}</strong>
                  <span>{stage.records.length} 条记录</span>
                </div>
                {index < pipelineStages.length - 1 ? <ArrowRight className="delivery-stage-arrow" size={16} /> : null}
              </div>
              <div className="delivery-stage-list">
                {stage.records.slice(0, 4).map((record) => (
                  <button key={`${record.kind}-${record.id}`} className="delivery-stage-item" onClick={() => onOpenRecord(record)}>
                    <span>{record.title}</span>
                    <StatusBadge status={record.status} label={statusLabel(record.kind, record.status)} showDot={false} />
                  </button>
                ))}
                {stage.records.length === 0 ? <div className="delivery-empty-inline">暂无记录</div> : null}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="候选发布" subtitle="已通过构建但尚未创建发布单的版本">
        <div className="delivery-candidate-list">
          {builds.filter((item) => item.status === 'released' && !releaseBuildIds.has(item.id)).slice(0, 6).map((build) => (
            <button
              key={build.id}
              className="delivery-candidate-row"
              onClick={() => {
                if (canManageDelivery) onCreateRelease();
                else onOpenRecord(buildRecords([build], [], projects, products)[0] ?? null);
              }}
            >
              <span className="text-mono">{build.version || build.id}</span>
              <strong>{build.name}</strong>
              <span>{formatDate(build.buildDate)}</span>
            </button>
          ))}
          {candidateCount === 0 ? <div className="delivery-empty-inline">暂无待发布候选</div> : null}
        </div>
      </Panel>
    </div>
  );
}
