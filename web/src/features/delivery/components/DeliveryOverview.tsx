import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FlaskConical,
  Hammer,
  Package,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  if (tone === 'done') return <CheckCircle2 size={15} strokeWidth={2} aria-hidden />;
  if (tone === 'risk') return <AlertTriangle size={15} strokeWidth={2} aria-hidden />;
  const Icon = STAGE_ICONS[stageId] || Package;
  return <Icon size={15} strokeWidth={2} aria-hidden />;
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
  const candidates = builds
    .filter((item) => item.status === 'released' && !releaseBuildIds.has(item.id))
    .slice(0, 8);
  const { t } = useTranslation();

  return (
    <div className="dl-overview-grid delivery-overview-grid">
      <Panel className="dl-pipeline-panel" title={t('features.delivery.deliveryOverview.pipelineTitle')} subtitle={t('features.delivery.deliveryOverview.pipelineSubtitle')}>
        <div className="dl-pipeline delivery-pipeline">
          {pipelineStages.map((stage, index) => (
            <div className={`dl-stage delivery-stage ${stage.tone}`} key={stage.id}>
              <div className="dl-stage-head delivery-stage-head">
                <span className="dl-stage-icon delivery-stage-icon" aria-hidden>
                  <StageIcon stageId={stage.id} tone={stage.tone} />
                </span>
                <div className="dl-stage-meta delivery-stage-meta">
                  <strong>{stage.label}</strong>
                  <span>{t('features.delivery.deliveryOverview.stageCount', { count: stage.records.length })}</span>
                </div>
                {index < pipelineStages.length - 1 ? (
                  <span className="dl-stage-arrow delivery-stage-arrow" aria-hidden>
                    <ArrowRight size={14} strokeWidth={2} />
                  </span>
                ) : null}
              </div>
              <div className="dl-stage-list delivery-stage-list">
                {stage.records.slice(0, 4).map((record) => (
                  <button
                    key={`${record.kind}-${record.id}`}
                    className="dl-stage-item delivery-stage-item"
                    onClick={() => onOpenRecord(record)}
                  >
                    <span className="dl-stage-item-title" title={record.title}>{record.title}</span>
                    <StatusBadge status={record.status} label={statusLabel(record.kind, record.status)} showDot={false} />
                  </button>
                ))}
                {stage.records.length === 0 ? <div className="dl-empty-inline delivery-empty-inline">{t('features.delivery.deliveryOverview.stageEmpty')}</div> : null}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="dl-candidate-panel" title={t('features.delivery.deliveryOverview.candidateTitle')} subtitle={t('features.delivery.deliveryOverview.candidateSubtitle', { count: candidateCount })}>
        <div className="dl-candidate-list delivery-candidate-list">
          {candidates.map((build) => (
            <button
              key={build.id}
              className="dl-candidate-row delivery-candidate-row"
              onClick={() => {
                if (canManageDelivery) onCreateRelease();
                else onOpenRecord(buildRecords([build], [], projects, products)[0] ?? null);
              }}
            >
              <span className="text-mono dl-candidate-version">{build.version || build.id}</span>
              <strong className="dl-candidate-name" title={build.name}>{build.name}</strong>
              <span className="dl-candidate-date">{formatDate(build.buildDate)}</span>
              {canManageDelivery ? <em>{t('features.delivery.deliveryOverview.createRelease')}</em> : <em>{t('features.delivery.deliveryOverview.view')}</em>}
            </button>
          ))}
          {candidateCount === 0 ? <div className="dl-empty-inline delivery-empty-inline">{t('features.delivery.deliveryOverview.noCandidates')}</div> : null}
        </div>
      </Panel>
    </div>
  );
}
