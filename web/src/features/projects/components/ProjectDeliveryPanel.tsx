import { useTranslation } from 'react-i18next';
import Panel from '../../../components/common/Panel';
import PageState from '../../../components/common/PageState';
import StatusBadge from '../../../components/common/StatusBadge';
import type { ProjectDetail } from '../../../types';
import {
  BUILD_STATUS_LABELS,
  RELEASE_STATUS_LABELS,
  REQUIREMENT_STATUS_LABELS,
  labelOf,
} from '../../../constants/enums';
import { deliverySummary, type ProjectDeliveryData } from '../deliveryModel';

export type DeliverySummary = ReturnType<typeof deliverySummary>;

function useDeliveryText() {
  return useTranslation();
}

/** Six delivery signal cards with the titled block header. */
export function DeliverySignals({ project, summary, onRetry }: { project: ProjectDetail; summary: DeliverySummary | null; onRetry: () => void }) {
  const { t } = useDeliveryText();
  if (!summary) return null;
  const {
    delivery,
    openRequirements,
    acceptedRequirements,
    openDefects,
    severeDefects,
    failedBuilds,
    releasedBuilds,
    releasedReleases,
    passedCases,
    testPassRate,
    latestBuild,
    latestRelease,
  } = summary;
  const signals = [
    {
      label: t('features.projects.projectDeliveryPanel.signalReqAccept'),
      value: `${acceptedRequirements.length}/${delivery.requirements.length}`,
      meta: t('features.projects.projectDeliveryPanel.signalReqOpen', { count: openRequirements.length }),
      tone: 'info' as const,
    },
    {
      label: t('features.projects.projectDeliveryPanel.signalTaskProgress'),
      value: `${project.progress}%`,
      meta: t('features.projects.projectDeliveryPanel.signalTaskCount', { count: project.tasks.length }),
      tone: project.progress >= 80 ? 'success' as const : 'info' as const,
    },
    {
      label: t('features.projects.projectDeliveryPanel.signalTestPass'),
      value: `${testPassRate}%`,
      meta: `${passedCases.length}/${delivery.testCases.length}`,
      tone: testPassRate >= 90 ? 'success' as const : testPassRate >= 70 ? 'warning' as const : 'risk' as const,
    },
    {
      label: t('features.projects.projectDeliveryPanel.signalOpenDefects'),
      value: String(openDefects.length),
      meta: t('features.projects.projectDeliveryPanel.signalSevere', { count: severeDefects.length }),
      tone: severeDefects.length > 0 ? 'risk' as const : openDefects.length > 0 ? 'warning' as const : 'success' as const,
    },
    {
      label: t('features.projects.projectDeliveryPanel.signalBuild'),
      value: `${releasedBuilds.length}/${delivery.builds.length}`,
      meta: latestBuild?.version || latestBuild?.name || t('features.projects.projectDeliveryPanel.none'),
      tone: failedBuilds.length > 0 ? 'risk' as const : 'success' as const,
    },
    {
      label: t('features.projects.projectDeliveryPanel.signalRelease'),
      value: String(releasedReleases.length),
      meta: latestRelease?.version || latestRelease?.name || t('features.projects.projectDeliveryPanel.none'),
      tone: releasedReleases.length > 0 ? 'success' as const : 'warning' as const,
    },
  ];
  return (
    <section className="pd-signal-block">
      <header className="pd-signal-head">
        <h3 className="pd-signal-title">{t('features.projects.projectDeliveryPanel.signalTitle')}</h3>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          {t('features.projects.projectDeliveryPanel.refresh')}
        </button>
      </header>
      <div className="pd-signal-strip">
        {signals.map((item) => (
          <div key={item.label} className={`pd-signal tone-${item.tone}`}>
            <span className="pd-signal-label">{item.label}</span>
            <strong className="pd-signal-value">{item.value}</strong>
            <span className="pd-signal-meta">{item.meta}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Top next-actions list (aside card). */
export function NextActionsCard({ summary }: { summary: DeliverySummary | null }) {
  const { t } = useDeliveryText();
  return (
    <Panel title={t('features.projects.projectDeliveryPanel.nextActions')} className="pd-aside-card" noPadding>
      {summary && summary.actionItems.length > 0 ? (
        <ol className="pd-action-list pd-aside-pad">
          {summary.actionItems.slice(0, 3).map((item, index) => (
            <li key={item}>
              <span className="pd-action-index">{index + 1}</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="pd-empty pd-aside-pad">{t('features.projects.projectDeliveryPanel.noBlockage')}</p>
      )}
    </Panel>
  );
}

/** Latest build/release artifacts (aside card). */
export function LatestArtifactsCard({ summary }: { summary: DeliverySummary | null }) {
  const { t } = useDeliveryText();
  const latestBuild = summary?.latestBuild ?? null;
  const latestRelease = summary?.latestRelease ?? null;
  return (
    <Panel title={t('features.projects.projectDeliveryPanel.latestArtifacts')} className="pd-aside-card" noPadding>
      <div className="pd-aside-pad">
        <div className="pd-artifact">
          <span>{t('features.projects.projectDeliveryPanel.artifactBuild')}</span>
          <strong className="truncate">{latestBuild?.name || t('features.projects.projectDeliveryPanel.noBuild')}</strong>
          {latestBuild ? <StatusBadge label={labelOf(BUILD_STATUS_LABELS, latestBuild.status)} status={latestBuild.status} /> : null}
        </div>
        <div className="pd-artifact">
          <span>{t('features.projects.projectDeliveryPanel.artifactRelease')}</span>
          <strong className="truncate">{latestRelease?.name || t('features.projects.projectDeliveryPanel.noRelease')}</strong>
          {latestRelease ? <StatusBadge label={labelOf(RELEASE_STATUS_LABELS, latestRelease.status)} status={latestRelease.status} /> : null}
        </div>
      </div>
    </Panel>
  );
}

/** Requirement delivery trace table (main column). */
export function DeliveryTrace({ project, summary }: { project: ProjectDetail; summary: DeliverySummary | null }) {
  const { t } = useDeliveryText();
  if (!summary) {
    return <div className="pd-empty pd-empty-pad">{t('features.projects.projectDeliveryPanel.noRequirements')}</div>;
  }
  const traceRows = summary.delivery.requirements.slice(0, 8).map((requirement) => {    const tasks = project.tasks.filter(
      (task) => task.requirementId === requirement.id || requirement.linkedTasks.includes(task.id),
    );
    const tests = summary.delivery.testCases.filter((item) => item.requirementId === requirement.id);
    const defects = summary.delivery.defects.filter((item) => item.requirementId === requirement.id);
    const builds = summary.delivery.builds.filter((item) =>
      item.linkedStories.includes(requirement.id) || defects.some((defect) => item.linkedBugs.includes(defect.id)),
    );
    const releases = summary.delivery.releases.filter((item) =>
      item.linkedStories.includes(requirement.id) || defects.some((defect) => item.linkedBugs.includes(defect.id)),
    );
    return { requirement, tasks, tests, defects, builds, releases };
  });
  return (
    <Panel title={t('features.projects.projectDeliveryPanel.traceTitle')} subtitle={t('features.projects.projectDeliveryPanel.traceSubtitle', { count: traceRows.length })} className="pd-trace-panel" noPadding>
      {traceRows.length === 0 ? (
        <div className="pd-empty pd-empty-pad">{t('features.projects.projectDeliveryPanel.noRequirements')}</div>
      ) : (
        <div className="pd-trace-table">
          <div className="pd-trace-head">
            <span>{t('features.projects.projectDeliveryPanel.traceReq')}</span>
            <span>{t('features.projects.projectDeliveryPanel.traceTask')}</span>
            <span>{t('features.projects.projectDeliveryPanel.traceTest')}</span>
            <span>{t('features.projects.projectDeliveryPanel.traceDefect')}</span>
            <span>{t('features.projects.projectDeliveryPanel.traceBuild')}</span>
            <span>{t('features.projects.projectDeliveryPanel.traceRelease')}</span>
          </div>
          {traceRows.map((row) => (
            <div className="pd-trace-row" key={row.requirement.id}>
              <div className="pd-trace-req">
                <strong className="truncate" title={row.requirement.title}>{row.requirement.title}</strong>
                <StatusBadge
                  label={labelOf(REQUIREMENT_STATUS_LABELS, row.requirement.status)}
                  status={row.requirement.status}
                />
              </div>
              <TraceMetric
                complete={row.tasks.filter((item) => item.status === 'done').length}
                total={row.tasks.length}
                label={t('features.projects.projectDeliveryPanel.traceDone')}
              />
              <TraceMetric
                complete={row.tests.filter((item) => item.status === 'passed').length}
                total={row.tests.length}
                label={t('features.projects.projectDeliveryPanel.tracePassed')}
              />
              <TraceMetric
                complete={row.defects.filter((item) => ['closed', 'rejected'].includes(item.status)).length}
                total={row.defects.length}
                label={t('features.projects.projectDeliveryPanel.traceClosed')}
              />
              <TraceStatus
                items={row.builds}
                empty={t('features.projects.projectDeliveryPanel.traceNotBuilt')}
                label={(item) => item.name}
                status={(item) => item.status}
                labels={BUILD_STATUS_LABELS}
              />
              <TraceStatus
                items={row.releases}
                empty={t('features.projects.projectDeliveryPanel.traceNotReleased')}
                label={(item) => item.name}
                status={(item) => item.status}
                labels={RELEASE_STATUS_LABELS}
              />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/**
 * Legacy single-column composition. Kept for compatibility; the overview tab
 * now composes the exported blocks into its two-column layout.
 */
export default function ProjectDeliveryPanel({
  project,
  data,
  loading,
  error,
  onRetry,
}: {
  project: ProjectDetail;
  data: ProjectDeliveryData | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const summary = loading || (error && !data) ? null : deliverySummary(project, data);
  return (
    <div className="pd-overview">
      {loading && !data ? (
        <PageState loading error={null} onRetry={onRetry} />
      ) : error && !data ? (
        <PageState loading={false} error={error} onRetry={onRetry} />
      ) : (
        <>
          {error ? (
            <div className="pd-banner-warn">{t('features.projects.projectDeliveryPanel.staleDataWarning')}</div>
          ) : null}
          <DeliverySignals project={project} summary={summary} onRetry={onRetry} />
          <div className="pd-focus-row">
            <div className="pd-focus-card">
              <div className="pd-focus-title">{t('features.projects.projectDeliveryPanel.nextActions')}</div>
              {summary && summary.actionItems.length > 0 ? (
                <ol className="pd-action-list">
                  {summary.actionItems.slice(0, 3).map((item, index) => (
                    <li key={item}>
                      <span className="pd-action-index">{index + 1}</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="pd-empty">{t('features.projects.projectDeliveryPanel.noBlockage')}</p>
              )}
            </div>
            <div className="pd-focus-card">
              <div className="pd-focus-title">{t('features.projects.projectDeliveryPanel.latestArtifacts')}</div>
              <div className="pd-artifact">
                <span>{t('features.projects.projectDeliveryPanel.artifactBuild')}</span>
                <strong className="truncate">{summary?.latestBuild?.name || t('features.projects.projectDeliveryPanel.noBuild')}</strong>
                {summary?.latestBuild ? <StatusBadge label={labelOf(BUILD_STATUS_LABELS, summary.latestBuild.status)} status={summary.latestBuild.status} /> : null}
              </div>
              <div className="pd-artifact">
                <span>{t('features.projects.projectDeliveryPanel.artifactRelease')}</span>
                <strong className="truncate">{summary?.latestRelease?.name || t('features.projects.projectDeliveryPanel.noRelease')}</strong>
                {summary?.latestRelease ? <StatusBadge label={labelOf(RELEASE_STATUS_LABELS, summary.latestRelease.status)} status={summary.latestRelease.status} /> : null}
              </div>
            </div>
          </div>
          <DeliveryTrace project={project} summary={summary} />
        </>
      )}
    </div>
  );
}

function TraceMetric({ complete, total, label }: { complete: number; total: number; label: string }) {
  return (
    <div className="pd-trace-metric">
      <strong>{complete}/{total}</strong>
      <span>{label}</span>
    </div>
  );
}

function TraceStatus<T>({
  items,
  empty,
  label,
  status,
  labels,
}: {
  items: T[];
  empty: string;
  label: (item: T) => string;
  status: (item: T) => string;
  labels: Record<string, string>;
}) {
  const item = items[0];
  if (!item) return <span className="pd-trace-empty">{empty}</span>;
  const itemStatus = status(item);
  const extra = items.length - 1;
  return (
    <div className="pd-trace-status">
      <span className="truncate" title={label(item)}>{label(item)}</span>
      <StatusBadge label={labelOf(labels, itemStatus)} status={itemStatus} />
      {extra > 0 ? <em>+{extra}</em> : null}
    </div>
  );
}
