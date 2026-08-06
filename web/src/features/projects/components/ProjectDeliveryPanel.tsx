import Panel from '../../../components/common/Panel';
import PageState from '../../../components/common/PageState';
import StatusBadge from '../../../components/common/StatusBadge';
import type { Build, Defect, ProjectDetail, Release, Requirement, TestCase } from '../../../types';
import {
  BUILD_STATUS_LABELS,
  RELEASE_STATUS_LABELS,
  REQUIREMENT_STATUS_LABELS,
  labelOf,
} from '../../../constants/enums';
import { deliverySummary, type ProjectDeliveryData } from '../deliveryModel';

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
    actionItems,
  } = deliverySummary(project, data);

  const traceRows = delivery.requirements.slice(0, 8).map((requirement) => {
    const tasks = project.tasks.filter(
      (task) => task.requirementId === requirement.id || requirement.linkedTasks.includes(task.id),
    );
    const tests = delivery.testCases.filter((item) => item.requirementId === requirement.id);
    const defects = delivery.defects.filter((item) => item.requirementId === requirement.id);
    const builds = delivery.builds.filter((item) =>
      item.linkedStories.includes(requirement.id) || defects.some((defect) => item.linkedBugs.includes(defect.id)),
    );
    const releases = delivery.releases.filter((item) =>
      item.linkedStories.includes(requirement.id) || defects.some((defect) => item.linkedBugs.includes(defect.id)),
    );
    return { requirement, tasks, tests, defects, builds, releases };
  });

  const signals = [
    {
      label: '需求验收',
      value: `${acceptedRequirements.length}/${delivery.requirements.length}`,
      meta: `${openRequirements.length} 未关闭`,
      tone: 'info' as const,
    },
    {
      label: '任务进度',
      value: `${project.progress}%`,
      meta: `${project.tasks.length} 个任务`,
      tone: project.progress >= 80 ? 'success' as const : 'info' as const,
    },
    {
      label: '测试通过',
      value: `${testPassRate}%`,
      meta: `${passedCases.length}/${delivery.testCases.length}`,
      tone: testPassRate >= 90 ? 'success' as const : testPassRate >= 70 ? 'warning' as const : 'risk' as const,
    },
    {
      label: '开放缺陷',
      value: String(openDefects.length),
      meta: `${severeDefects.length} 高严重`,
      tone: severeDefects.length > 0 ? 'risk' as const : openDefects.length > 0 ? 'warning' as const : 'success' as const,
    },
    {
      label: '构建',
      value: `${releasedBuilds.length}/${delivery.builds.length}`,
      meta: latestBuild?.version || latestBuild?.name || '暂无',
      tone: failedBuilds.length > 0 ? 'risk' as const : 'success' as const,
    },
    {
      label: '发布',
      value: String(releasedReleases.length),
      meta: latestRelease?.version || latestRelease?.name || '暂无',
      tone: releasedReleases.length > 0 ? 'success' as const : 'warning' as const,
    },
  ];

  return (
    <div className="pd-overview">
      {loading && !data ? (
        <PageState loading error={null} onRetry={onRetry} />
      ) : error && !data ? (
        <PageState loading={false} error={error} onRetry={onRetry} />
      ) : (
        <>
          {error ? (
            <div className="pd-banner-warn">部分交付数据刷新失败，当前展示缓存结果。</div>
          ) : null}

          <section className="pd-signal-strip">
            {signals.map((item) => (
              <div key={item.label} className={`pd-signal tone-${item.tone}`}>
                <span className="pd-signal-label">{item.label}</span>
                <strong className="pd-signal-value">{item.value}</strong>
                <span className="pd-signal-meta">{item.meta}</span>
              </div>
            ))}
            <button type="button" className="pd-signal-refresh btn btn-secondary btn-sm" onClick={onRetry}>
              刷新
            </button>
          </section>

          <section className="pd-focus-row">
            <div className="pd-focus-card">
              <div className="pd-focus-title">下一步动作</div>
              {actionItems.length === 0 ? (
                <p className="pd-empty">当前链路无明显阻塞，保持验收与发布节奏。</p>
              ) : (
                <ol className="pd-action-list">
                  {actionItems.slice(0, 3).map((item, index) => (
                    <li key={item}>
                      <span className="pd-action-index">{index + 1}</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="pd-focus-card">
              <div className="pd-focus-title">最新交付物</div>
              <div className="pd-artifact">
                <span>构建</span>
                <strong className="truncate">{latestBuild?.name || '暂无构建'}</strong>
                {latestBuild ? <StatusBadge label={labelOf(BUILD_STATUS_LABELS, latestBuild.status)} status={latestBuild.status} /> : null}
              </div>
              <div className="pd-artifact">
                <span>发布</span>
                <strong className="truncate">{latestRelease?.name || '暂无发布'}</strong>
                {latestRelease ? <StatusBadge label={labelOf(RELEASE_STATUS_LABELS, latestRelease.status)} status={latestRelease.status} /> : null}
              </div>
            </div>
          </section>

          <Panel title="需求交付追踪" subtitle={`展示前 ${traceRows.length} 条需求链路`} className="pd-trace-panel" noPadding>
            {traceRows.length === 0 ? (
              <div className="pd-empty pd-empty-pad">该项目暂无需求，先从需求管理录入业务条目。</div>
            ) : (
              <div className="pd-trace-table">
                <div className="pd-trace-head">
                  <span>需求</span>
                  <span>任务</span>
                  <span>测试</span>
                  <span>缺陷</span>
                  <span>构建</span>
                  <span>发布</span>
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
                      label="完成"
                    />
                    <TraceMetric
                      complete={row.tests.filter((item) => item.status === 'passed').length}
                      total={row.tests.length}
                      label="通过"
                    />
                    <TraceMetric
                      complete={row.defects.filter((item) => ['closed', 'rejected'].includes(item.status)).length}
                      total={row.defects.length}
                      label="关闭"
                    />
                    <TraceStatus
                      items={row.builds}
                      empty="未构建"
                      label={(item) => item.name}
                      status={(item) => item.status}
                      labels={BUILD_STATUS_LABELS}
                    />
                    <TraceStatus
                      items={row.releases}
                      empty="未发布"
                      label={(item) => item.name}
                      status={(item) => item.status}
                      labels={RELEASE_STATUS_LABELS}
                    />
                  </div>
                ))}
              </div>
            )}
          </Panel>
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
  return (
    <div className="pd-trace-status">
      <span className="truncate" title={label(item)}>{label(item)}</span>
      <StatusBadge label={labelOf(labels, itemStatus)} status={itemStatus} />
    </div>
  );
}
