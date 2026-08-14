import { describe, expect, it } from 'vitest';
import {
  capabilityInputFields,
  capabilityOutputEntries,
  normalizeAiCapabilityList,
  normalizeAiCapabilityManifest,
  validateCapabilityInput,
} from './capabilityPresentation';

function projectSnapshotManifest() {
  return {
    id: 'project-snapshot',
    version: '1.0.0',
    status: 'approved',
    risk: 'read_only',
    scopes: ['project-management'],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['projectId'],
      properties: {
        projectId: { type: 'string', minLength: 1, maxLength: 128 },
      },
    },
    outputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { summary: { type: 'string' } },
    },
    requiresConfirmation: false,
  };
}

describe('AI capability presentation contract', () => {
  it('accepts only the BFF declarative manifest subset', () => {
    const manifest = projectSnapshotManifest();

    expect(normalizeAiCapabilityManifest(manifest)).toMatchObject({
      id: 'project-snapshot',
      status: 'approved',
      risk: 'read_only',
      requiresConfirmation: false,
    });

    expect(normalizeAiCapabilityManifest({ ...manifest, status: 'disabled' })).toBeNull();
    expect(normalizeAiCapabilityManifest({ ...manifest, requiresConfirmation: true })).toBeNull();
    expect(normalizeAiCapabilityManifest({
      ...manifest,
      inputSchema: { ...manifest.inputSchema, additionalProperties: true },
    })).toBeNull();
  });

  it('normalizes a capability envelope and drops unsafe entries', () => {
    const manifest = projectSnapshotManifest();
    const capabilities = normalizeAiCapabilityList({
      capabilities: [manifest, { ...manifest, id: 'not a valid id' }, manifest],
    });

    expect(capabilities).toHaveLength(1);
    expect(capabilities[0]?.id).toBe('project-snapshot');
  });

  it('submits only declared trimmed string inputs', () => {
    const capability = normalizeAiCapabilityManifest(projectSnapshotManifest());
    if (!capability) throw new Error('expected a valid fixture');

    expect(capabilityInputFields(capability)).toEqual([
      { name: 'projectId', required: true, minLength: 1, maxLength: 128 },
    ]);
    expect(validateCapabilityInput(capability, { projectId: ' PRJ-1 ', injected: 'nope' })).toEqual({
      input: { projectId: 'PRJ-1' },
      invalidFields: [],
    });
    expect(validateCapabilityInput(capability, { projectId: ' ' }).invalidFields).toEqual(['projectId']);
  });

  it('renders only declared output fields with their declared types', () => {
    const capability = normalizeAiCapabilityManifest(projectSnapshotManifest());
    if (!capability) throw new Error('expected a valid fixture');

    expect(capabilityOutputEntries(capability, {
      summary: 'Project is on track.',
      injected: 'never rendered',
    })).toEqual([{ name: 'summary', value: 'Project is on track.' }]);
  });
});
