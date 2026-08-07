import type { Build, Defect, ProjectDetail, Release, Requirement, TestCase } from '../../types';
import i18n from '../../i18n';

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
    severeDefects.length > 0 ? i18n.t('features.projects.deliveryModel.prioritizeSevere', { count: severeDefects.length }) : null,
    failedBuilds.length > 0 ? i18n.t('features.projects.deliveryModel.reviewFailedBuilds', { count: failedBuilds.length }) : null,
    openRequirements.length > acceptedRequirements.length ? i18n.t('features.projects.deliveryModel.advanceOpenRequirements') : null,
    delivery.releases.length > 0 && releasedReleases.length === 0 ? i18n.t('features.projects.deliveryModel.noReleasedVersion') : null,
    delivery.releases.length === 0 ? i18n.t('features.projects.deliveryModel.noReleaseRecord') : null,
  ].filter((item): item is string => Boolean(item));
  return { delivery, openRequirements, acceptedRequirements, openDefects, severeDefects, failedBuilds, releasedBuilds, releasedReleases, passedCases, testPassRate, latestBuild, latestRelease, actionItems };
}
