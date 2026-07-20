import type { Build, Defect, ProjectDetail, Release, Requirement, TestCase } from '../../types';

export interface ProjectDeliveryData {
  requirements: Requirement[];
  testCases: TestCase[];
  defects: Defect[];
  builds: Build[];
  releases: Release[];
}

export function latestBy<T>(items: T[], dateOf: (item: T) => string | null | undefined): T | null {
  return [...items].sort((a, b) => {
    const left = Date.parse(dateOf(a) ?? '');
    const right = Date.parse(dateOf(b) ?? '');
    return (Number.isNaN(right) ? 0 : right) - (Number.isNaN(left) ? 0 : left);
  })[0] ?? null;
}

export function deliverySummary(project: ProjectDetail, data: ProjectDeliveryData | null) {
  const delivery = data ?? { requirements: [], testCases: [], defects: [], builds: [], releases: [] };
  const openRequirements = delivery.requirements.filter((item) => !['closed', 'cancelled'].includes(item.status));
  const acceptedRequirements = delivery.requirements.filter((item) => ['accepted', 'closed'].includes(item.status));
  const openDefects = delivery.defects.filter((item) => !['closed', 'rejected'].includes(item.status));
  const severeDefects = openDefects.filter((item) => ['high', 'critical'].includes(item.severity));
  const failedBuilds = delivery.builds.filter((item) => item.status === 'failed');
  const releasedBuilds = delivery.builds.filter((item) => item.status === 'released');
  const releasedReleases = delivery.releases.filter((item) => item.status === 'released');
  const passedCases = delivery.testCases.filter((item) => item.status === 'passed');
  const testPassRate = delivery.testCases.length ? Math.round((passedCases.length / delivery.testCases.length) * 100) : 0;
  const latestBuild = latestBy(delivery.builds, (item) => item.buildDate || item.createdAt);
  const latestRelease = latestBy(delivery.releases, (item) => item.releaseDate || item.createdAt);
  const actionItems = [
    severeDefects.length > 0 ? `优先收敛 ${severeDefects.length} 个高严重级别缺陷` : null,
    failedBuilds.length > 0 ? `复盘 ${failedBuilds.length} 次失败构建并明确责任人` : null,
    openRequirements.length > acceptedRequirements.length ? '推动未验收需求进入评审、测试或验收节点' : null,
    delivery.releases.length > 0 && releasedReleases.length === 0 ? '发布记录已创建，但还没有正式发布版本' : null,
    delivery.releases.length === 0 ? '当前项目关联产品下还没有发布记录' : null,
  ].filter((item): item is string => Boolean(item));
  return { delivery, openRequirements, acceptedRequirements, openDefects, severeDefects, failedBuilds, releasedBuilds, releasedReleases, passedCases, testPassRate, latestBuild, latestRelease, actionItems };
}
