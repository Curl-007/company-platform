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
import { deliverySummary } from '../deliveryModel';

export interface ProjectDeliveryData {
  requirements: Requirement[];
  testCases: TestCase[];
  defects: Defect[];
  builds: Build[];
  releases: Release[];
}

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
  const { delivery, openRequirements, acceptedRequirements, openDefects, severeDefects, failedBuilds, releasedBuilds, releasedReleases, passedCases, testPassRate, latestBuild, latestRelease, actionItems } = deliverySummary(project, data);
  const traceRows = delivery.requirements.slice(0, 6).map((requirement) => {
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

  return (
    <Panel
      title="项目交付总览"
      subtitle="需求、任务、测试、缺陷、构建和发布的同屏追踪"
      toolbar={<button className="btn btn-secondary btn-sm" onClick={onRetry}>刷新</button>}
    >
      {loading && !data ? (
        <PageState loading error={null} onRetry={onRetry} />
      ) : error && !data ? (
        <PageState loading={false} error={error} onRetry={onRetry} />
      ) : (
        <>
          {error && (
            <div className="helper-text" style={{ marginBottom: 12, color: 'var(--color-warning, #BF8700)' }}>
              部分交付数据刷新失败，当前展示上一次缓存结果。
            </div>
          )}

          <div className="project-delivery-grid">
            <DeliverySignal label="需求验收" value={`${acceptedRequirements.length}/${delivery.requirements.length}`} meta={`${openRequirements.length} 个未关闭`} tone="info" />
            <DeliverySignal label="任务进度" value={`${project.progress}%`} meta={`${project.tasks.length} 个 WBS 任务`} tone={project.progress >= 80 ? 'success' : 'info'} />
            <DeliverySignal label="测试通过" value={`${testPassRate}%`} meta={`${passedCases.length}/${delivery.testCases.length} 个用例`} tone={testPassRate >= 90 ? 'success' : testPassRate >= 70 ? 'warning' : 'risk'} />
            <DeliverySignal label="开放缺陷" value={openDefects.length} meta={`${severeDefects.length} 个高严重级别`} tone={severeDefects.length > 0 ? 'risk' : openDefects.length > 0 ? 'warning' : 'success'} />
            <DeliverySignal label="构建发布" value={`${releasedBuilds.length}/${delivery.builds.length}`} meta={latestBuild ? `${latestBuild.name} ${latestBuild.version ?? ''}` : '暂无构建'} tone={failedBuilds.length > 0 ? 'risk' : 'success'} />
            <DeliverySignal label="正式发布" value={releasedReleases.length} meta={latestRelease ? `${latestRelease.name} ${latestRelease.version ?? ''}` : '暂无发布'} tone={releasedReleases.length > 0 ? 'success' : 'warning'} />
          </div>

          <div className="delivery-focus-grid">
            <div className="delivery-focus-card">
              <div className="section-title">下一步动作</div>
              {actionItems.length === 0 ? (
                <p className="body-text" style={{ marginBottom: 0 }}>当前交付链路没有明显阻塞项，继续保持需求验收和构建发布节奏。</p>
              ) : (
                <ul className="delivery-action-list">
                  {actionItems.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
            </div>
            <div className="delivery-focus-card">
              <div className="section-title">最新交付物</div>
              <div className="delivery-artifact-row">
                <span>构建</span>
                <strong>{latestBuild ? latestBuild.name : '暂无构建'}</strong>
                {latestBuild && <StatusBadge label={labelOf(BUILD_STATUS_LABELS, latestBuild.status)} status={latestBuild.status} />}
              </div>
              <div className="delivery-artifact-row">
                <span>发布</span>
                <strong>{latestRelease ? latestRelease.name : '暂无发布'}</strong>
                {latestRelease && <StatusBadge label={labelOf(RELEASE_STATUS_LABELS, latestRelease.status)} status={latestRelease.status} />}
              </div>
            </div>
          </div>

          <div className="trace-matrix">
            <div className="trace-matrix-header">
              <span>需求</span>
              <span>任务</span>
              <span>测试</span>
              <span>缺陷</span>
              <span>构建</span>
              <span>发布</span>
            </div>
            {traceRows.length === 0 ? (
              <div className="trace-matrix-empty">该项目暂无需求，先从需求管理录入业务条目。</div>
            ) : (
              traceRows.map((row) => (
                <div className="trace-matrix-row" key={row.requirement.id}>
                  <div>
                    <div className="font-medium">{row.requirement.title}</div>
                    <StatusBadge label={labelOf(REQUIREMENT_STATUS_LABELS, row.requirement.status)} status={row.requirement.status} />
                  </div>
                  <TraceMetric count={row.tasks.length} complete={row.tasks.filter((item) => item.status === 'done').length} label="任务" />
                  <TraceMetric count={row.tests.length} complete={row.tests.filter((item) => item.status === 'passed').length} label="通过" />
                  <TraceMetric count={row.defects.length} complete={row.defects.filter((item) => ['closed', 'rejected'].includes(item.status)).length} label="关闭" />
                  <TraceStatus items={row.builds} empty="未构建" label={(item) => item.name} status={(item) => item.status} labels={BUILD_STATUS_LABELS} />
                  <TraceStatus items={row.releases} empty="未发布" label={(item) => item.name} status={(item) => item.status} labels={RELEASE_STATUS_LABELS} />
                </div>
              ))
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

function DeliverySignal({
  label,
  value,
  meta,
  tone,
}: {
  label: string;
  value: string | number;
  meta: string;
  tone: 'success' | 'warning' | 'risk' | 'info';
}) {
  return (
    <div className={`delivery-signal ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{meta}</small>
    </div>
  );
}

function TraceMetric({ count, complete, label }: { count: number; complete: number; label: string }) {
  return (
    <div className="trace-metric">
      <strong>{complete}/{count}</strong>
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
  if (!item) return <span className="trace-empty">{empty}</span>;
  const itemStatus = status(item);
  return (
    <div className="trace-status">
      <span>{label(item)}</span>
      <StatusBadge label={labelOf(labels, itemStatus)} status={itemStatus} />
    </div>
  );
}

