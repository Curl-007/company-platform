import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FlaskConical,
  Hammer,
  Package,
  type LucideIcon,
} from 'lucide-react';
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

const STAGE_ICONS: Record<string, LucideIcon> = {
  building: Hammer,
  testing: FlaskConical,
  candidate: Package,
  released: CheckCircle2,
  risk: AlertTriangle,
};

function StageIcon({ stageId, tone }: { stageId: string; tone: StageTone }) {
  if (tone === 'done') return <CheckCircle2 size={16} strokeWidth={2} aria-hidden />;
  if (tone === 'risk') return <AlertTriangle size={16} strokeWidth={2} aria-hidden />;
  const Icon = STAGE_ICONS[stageId] || Package;
  return <Icon size={16} strokeWidth={2} aria-hidden />;
}

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
                <span className="delivery-stage-icon" aria-hidden>
                  <StageIcon stageId={stage.id} tone={stage.tone} />
                </span>
                <div className="delivery-stage-meta">
                  <strong>{stage.label}</strong>
                  <span>{stage.records.length} 条记录</span>
                </div>
                {index < pipelineStages.length - 1 ? (
                  <span className="delivery-stage-arrow" aria-hidden>
                    <ArrowRight size={16} strokeWidth={2} />
                  </span>
                ) : null}
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
