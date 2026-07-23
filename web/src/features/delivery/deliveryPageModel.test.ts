import { describe, expect, it } from 'vitest';
import { buildPipelineStages, type DeliveryRecord } from './deliveryPageModel';

function record(id: string, kind: DeliveryRecord['kind'], status: string): DeliveryRecord {
  return {
    id,
    kind,
    status,
    title: id,
    ownerLabel: '测试项目',
    linkedStories: [],
    linkedBugs: [],
    source: {} as DeliveryRecord['source'],
  };
}

describe('buildPipelineStages', () => {
  it('keeps the primary delivery flow to four stages', () => {
    const stages = buildPipelineStages([
      record('build-building', 'build', 'building'),
      record('build-testing', 'build', 'testing'),
      record('build-candidate', 'build', 'released'),
      record('release-draft', 'release', 'draft'),
      record('release-staging', 'release', 'staging'),
      record('release-published', 'release', 'released'),
      record('build-failed', 'build', 'failed'),
      record('release-rollback', 'release', 'rollback'),
    ], new Set());

    expect(stages.map((stage) => stage.id)).toEqual([
      'building',
      'testing',
      'candidate',
      'released',
    ]);
    expect(stages.flatMap((stage) => stage.records.map((item) => item.id))).not.toContain('build-failed');
    expect(stages.flatMap((stage) => stage.records.map((item) => item.id))).not.toContain('release-rollback');
  });

  it('does not repeat a build that already has a release record', () => {
    const stages = buildPipelineStages(
      [record('build-candidate', 'build', 'released')],
      new Set(['build-candidate']),
    );

    expect(stages.find((stage) => stage.id === 'candidate')?.records).toEqual([]);
  });
});
