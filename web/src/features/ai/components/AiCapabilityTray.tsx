import { useEffect, useMemo, useState } from 'react';
import { ListTree, Play, Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AiCapabilityInvocation, AiCapabilityManifest, Project } from '../../../types';
import {
  capabilityInputFields,
  capabilityOutputEntries,
  validateCapabilityInput,
} from '../models/capabilityPresentation';
import type { AiCapabilityAvailability } from '../api/capabilities';
import { invocationStatusLabel } from '../models/harnessModel';

// project-snapshot is hidden from the tray surface (the capability stays
// available to the harness); the tray lists the actionable tools only.
const HIDDEN_CAPABILITY_IDS = new Set(['project-snapshot']);

function capabilityTitle(capability: AiCapabilityManifest, t: (key: string) => string): string {
  if (capability.id === 'project-snapshot') return t('features.ai.aiCapabilityTray.projectSnapshot');
  return capability.id;
}

function fieldLabel(name: string, t: (key: string) => string): string {
  if (name === 'projectId') return t('features.ai.aiCapabilityTray.project');
  return name;
}

export default function AiCapabilityTray({
  availability,
  projects,
  latestInvocation,
  invokingCapabilityId,
  onInvoke,
  onOpenInvocationTrace,
}: {
  availability: AiCapabilityAvailability | null;
  projects: Project[];
  latestInvocation: AiCapabilityInvocation | null;
  invokingCapabilityId: string | null;
  onInvoke: (capability: AiCapabilityManifest, input: Record<string, string>) => Promise<void>;
  onOpenInvocationTrace: (invocationId: string) => void;
}) {
  const { t } = useTranslation();
  const [selectedCapabilityId, setSelectedCapabilityId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [invalidFields, setInvalidFields] = useState<string[]>([]);

  // project-snapshot is hidden from the tray surface (the capability stays
  // available to the harness); the tray lists the actionable tools only.
  const capabilities = useMemo(
    () => (availability?.capabilities ?? []).filter((capability) => !HIDDEN_CAPABILITY_IDS.has(capability.id)),
    [availability?.capabilities],
  );
  const selectedCapability = useMemo(
    () => capabilities.find((capability) => capability.id === selectedCapabilityId) ?? null,
    [capabilities, selectedCapabilityId],
  );
  const fields = useMemo(
    () => selectedCapability ? capabilityInputFields(selectedCapability) : [],
    [selectedCapability],
  );
  const latestCapability = useMemo(
    () => capabilities.find((capability) => capability.id === latestInvocation?.capabilityId) ?? null,
    [capabilities, latestInvocation?.capabilityId],
  );
  const outputEntries = useMemo(
    () => latestCapability ? capabilityOutputEntries(latestCapability, latestInvocation?.result) : [],
    [latestCapability, latestInvocation?.result],
  );

  useEffect(() => {
    setValues({});
    setInvalidFields([]);
  }, [selectedCapability?.id]);

  async function submit() {
    if (!selectedCapability) return;
    const validation = validateCapabilityInput(selectedCapability, values);
    setInvalidFields(validation.invalidFields);
    if (validation.invalidFields.length > 0) return;
    await onInvoke(selectedCapability, validation.input);
  }

  if (!availability) {
    return (
      <div className="ai-capability-tray is-pending" role="status">
        <Sparkles size={14} aria-hidden="true" />
        <span>{t('features.ai.aiCapabilityTray.loading')}</span>
      </div>
    );
  }

  if (availability.state === 'unavailable') {
    return (
      <div className="ai-capability-tray is-unavailable" role="status">
        <Sparkles size={14} aria-hidden="true" />
        <span>{t('features.ai.aiCapabilityTray.unavailable')}</span>
      </div>
    );
  }

  if (capabilities.length === 0) {
    return (
      <div className="ai-capability-tray is-unavailable" role="status">
        <Sparkles size={14} aria-hidden="true" />
        <span>{t('features.ai.aiCapabilityTray.none')}</span>
      </div>
    );
  }

  return (
    <div className="ai-capability-tray" aria-label={t('features.ai.aiCapabilityTray.title')}>
      <div className="ai-capability-actions" role="group" aria-label={t('features.ai.aiCapabilityTray.title')}>
        {capabilities.map((capability) => (
          <button
            key={capability.id}
            type="button"
            className={`btn btn-secondary btn-sm ${selectedCapabilityId === capability.id ? 'active' : ''}`}
            onClick={() => setSelectedCapabilityId((current) => current === capability.id ? null : capability.id)}
            aria-pressed={selectedCapabilityId === capability.id}
            disabled={invokingCapabilityId !== null}
          >
            <Sparkles size={14} aria-hidden="true" />
            {capabilityTitle(capability, t)}
          </button>
        ))}
      </div>

      {selectedCapability ? (
        <div className="ai-capability-form">
          <div className="ai-capability-form-meta">
            <span className="text-mono">v{selectedCapability.version}</span>
          </div>
          {fields.map((field) => {
            const hasProjectChoices = field.name === 'projectId' && projects.length > 0;
            const invalid = invalidFields.includes(field.name);
            return (
              <div className="form-group" key={field.name}>
                <label className="form-label" htmlFor={`ai-capability-${selectedCapability.id}-${field.name}`}>
                  {fieldLabel(field.name, t)}{field.required ? ' *' : ''}
                </label>
                {hasProjectChoices ? (
                  <select
                    id={`ai-capability-${selectedCapability.id}-${field.name}`}
                    className="form-select"
                    value={values[field.name] ?? ''}
                    onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                    aria-invalid={invalid || undefined}
                    disabled={invokingCapabilityId !== null}
                  >
                    <option value="">{t('features.ai.aiCapabilityTray.selectProject')}</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                ) : (
                  <input
                    id={`ai-capability-${selectedCapability.id}-${field.name}`}
                    className="form-input"
                    value={values[field.name] ?? ''}
                    onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                    maxLength={field.maxLength}
                    aria-invalid={invalid || undefined}
                    disabled={invokingCapabilityId !== null}
                  />
                )}
                {invalid ? <div className="form-error">{t('features.ai.aiCapabilityTray.invalidInput')}</div> : null}
              </div>
            );
          })}
          <div className="ai-capability-form-actions">
            <button
              type="button"
              className="btn btn-text btn-sm"
              onClick={() => setSelectedCapabilityId(null)}
              disabled={invokingCapabilityId !== null}
              title={t('features.ai.aiCapabilityTray.close')}
              aria-label={t('features.ai.aiCapabilityTray.close')}
            >
              <X size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => { void submit(); }}
              disabled={invokingCapabilityId !== null}
            >
              <Play size={14} aria-hidden="true" />
              {invokingCapabilityId === selectedCapability.id
                ? t('features.ai.aiCapabilityTray.running')
                : t('features.ai.aiCapabilityTray.run')}
            </button>
          </div>
        </div>
      ) : null}
      {latestInvocation && latestCapability && outputEntries.length > 0 ? (
        <div className="ai-capability-result" role="status">
          <div className="ai-capability-result-header">
            <span>{capabilityTitle(latestCapability, t)}</span>
            <span className="ai-capability-recent-meta">
              <span className="text-mono">{invocationStatusLabel(latestInvocation.status)}</span>
              {latestInvocation.invocationId ? (
                <button
                  type="button"
                  className="btn btn-text btn-xs"
                  onClick={() => onOpenInvocationTrace(latestInvocation.invocationId as string)}
                  title={t('features.ai.aiCapabilityTray.traceButtonTitle')}
                >
                  <ListTree size={12} aria-hidden="true" />
                  {t('features.ai.aiCapabilityTray.openTrace')}
                </button>
              ) : null}
            </span>
          </div>
          <dl className="ai-capability-result-fields">
            {outputEntries.map((entry) => (
              <div key={entry.name}>
                <dt>{entry.name}</dt>
                <dd>
                  {entry.link ? (
                    <a className="ai-capability-result-link" href={entry.link} target="_blank" rel="noreferrer">
                      {t('features.ai.aiCapabilityTray.viewArtifact')}
                    </a>
                  ) : entry.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
