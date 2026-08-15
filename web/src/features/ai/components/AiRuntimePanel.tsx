import { useTranslation } from 'react-i18next';
import { Boxes, CircuitBoard, Layers, RefreshCw, ServerCog } from 'lucide-react';
import { useHarnessStatus } from '../hooks/useHarnessStatus';

/**
 * dsh (DeepSeek Harness) runtime status strip: composition identity, plugin
 * pipeline, and runtime reuse/queue/proxy health. A failed request degrades
 * to a single error line and never blocks the rest of the AI workspace.
 */
export default function AiRuntimePanel() {
  const { t } = useTranslation();
  const statusQuery = useHarnessStatus();

  if (statusQuery.isError) {
    return (
      <div className="ai-runtime-error" role="status">
        <ServerCog size={14} aria-hidden="true" />
        <span>{t('features.ai.aiRuntimePanel.loadFailed')}</span>
      </div>
    );
  }

  const status = statusQuery.data;
  if (!status) {
    return (
      <div className="ai-runtime-card" role="status" aria-busy="true">
        <div className="ai-runtime-identity">
          <strong>{t('features.ai.aiRuntimePanel.title')}</strong>
          <em>{t('features.ai.aiRuntimePanel.loading')}</em>
        </div>
      </div>
    );
  }

  const { composition, runtime } = status;

  return (
    <section className="ai-runtime-card" aria-label={t('features.ai.aiRuntimePanel.title')}>
      <div className="ai-runtime-identity">
        <strong>
          <CircuitBoard size={14} aria-hidden="true" />
          <span className="text-mono">{composition.id}</span>
          {composition.sdkVersion ? (
            <span className="text-mono">{t('features.ai.aiRuntimePanel.sdkVersion', { version: composition.sdkVersion })}</span>
          ) : null}
        </strong>
        <em>{t('features.ai.aiRuntimePanel.subtitle')}</em>
      </div>

      <div
        className="ai-runtime-plugins"
        role="group"
        aria-label={t('features.ai.aiRuntimePanel.plugins')}
      >
        <Layers size={14} aria-hidden="true" />
        {composition.plugins.map((plugin) => (
          <span
            key={plugin.id}
            className={`ai-runtime-plugin ${plugin.kind === 'builtin' ? 'is-builtin' : 'is-company'}`}
            title={plugin.name}
          >
            {plugin.id}
          </span>
        ))}
      </div>

      <div className="ai-runtime-stats">
        <span className="ai-runtime-stat" role="status">
          <span className={`ai-runtime-dot ${runtime.active ? 'is-active' : 'is-idle'}`} aria-hidden="true" />
          {runtime.active ? t('features.ai.aiRuntimePanel.runtimeActive') : t('features.ai.aiRuntimePanel.runtimeIdle')}
        </span>
        {runtime.maxRunsPerRuntime === 0 && runtime.totalCalls !== undefined ? (
          <span
            className="ai-runtime-stat"
            title={t('features.ai.aiRuntimePanel.runtimePersistentTitle')}
          >
            <Boxes size={13} aria-hidden="true" />
            {t('features.ai.aiRuntimePanel.runtimeCallsTotal', { calls: runtime.totalCalls })}
          </span>
        ) : (
          <span className="ai-runtime-stat">
            <Boxes size={13} aria-hidden="true" />
            {t('features.ai.aiRuntimePanel.runtimeReuse', {
              active: runtime.activeCalls,
              max: runtime.maxRunsPerRuntime,
            })}
          </span>
        )}
        {runtime.totalRuns !== undefined ? (
          <span
            className="ai-runtime-stat"
            title={t('features.ai.aiRuntimePanel.runtimeGenerationTitle')}
          >
            <RefreshCw size={13} aria-hidden="true" />
            {t('features.ai.aiRuntimePanel.runtimeGeneration', { count: runtime.totalRuns })}
          </span>
        ) : null}
        <span className="ai-runtime-stat">
          {t('features.ai.aiRuntimePanel.queued', { count: runtime.queued })}
        </span>
        <span className="ai-runtime-stat">
          {t('features.ai.aiRuntimePanel.proxy')}
          {runtime.proxy.started
            ? t('features.ai.aiRuntimePanel.proxyStarted')
            : t('features.ai.aiRuntimePanel.proxyStopped')}
        </span>
        <span className="ai-runtime-stat">
          {t('features.ai.aiRuntimePanel.tokenUsageService')}
          {status.tokenUsageService
            ? t('features.ai.aiRuntimePanel.tokenUsageOn')
            : t('features.ai.aiRuntimePanel.tokenUsageOff')}
        </span>
      </div>
    </section>
  );
}
