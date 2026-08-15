import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiCapabilityInvocation, AiCapabilityManifest } from '../../../types';
import { invokeAiCapability } from '../api/capabilities';
import { useToast } from '../../../components/common/Toast';
import { queryClient } from '../../../lib/queryClient';

// ---------------------------------------------------------------------------
// useCapabilityRunner: dsh capability invocation flow extracted from AiView.
//
// Owns invoking/latest invocation state, the invocation project scope, the
// trace drawer target, plus the toast + query invalidation side effects, so
// the AI workspace and the global agent sidebar share one implementation.
// ---------------------------------------------------------------------------

export interface UseCapabilityRunnerOptions {
  /** Fired after a successful invoke (AiView opens the job review panel). */
  onInvocationQueued?: (invocation: AiCapabilityInvocation) => void | Promise<void>;
  /** Fired after a successful invoke (AiView reloads the summary strip). */
  onSummaryChanged?: () => void;
}

export interface CapabilityRunner {
  invokingCapabilityId: string | null;
  latestInvocation: AiCapabilityInvocation | null;
  clearLatestInvocation: () => void;
  /** Project scope for the invocation history (non-admin must scope). */
  invocationProjectId: string;
  setInvocationProjectId: (projectId: string) => void;
  /** dsh execution trace drawer target; null keeps the drawer closed. */
  timelineInvocationId: string | null;
  setTimelineInvocationId: (invocationId: string | null) => void;
  openInvocationTrace: (invocationId: string) => void;
  invokeCapability: (capability: AiCapabilityManifest, input: Record<string, string>) => Promise<void>;
}

export function useCapabilityRunner({
  onInvocationQueued,
  onSummaryChanged,
}: UseCapabilityRunnerOptions = {}): CapabilityRunner {
  const { t } = useTranslation();
  const toast = useToast();
  const [invokingCapabilityId, setInvokingCapabilityId] = useState<string | null>(null);
  const [latestInvocation, setLatestInvocation] = useState<AiCapabilityInvocation | null>(null);
  const [invocationProjectId, setInvocationProjectId] = useState('');
  const [timelineInvocationId, setTimelineInvocationId] = useState<string | null>(null);

  const clearLatestInvocation = useCallback(() => setLatestInvocation(null), []);
  const openInvocationTrace = useCallback((invocationId: string) => setTimelineInvocationId(invocationId), []);

  const invokeCapability = useCallback(async (
    capability: AiCapabilityManifest,
    input: Record<string, string>,
  ) => {
    setInvokingCapabilityId(capability.id);
    try {
      const invocation = await invokeAiCapability(capability.id, input);
      setLatestInvocation(invocation);
      if (input.projectId) setInvocationProjectId(input.projectId);
      void queryClient.invalidateQueries({ queryKey: ['ai', 'invocations'] });
      toast.success(t('features.ai.aiView.capabilityQueued'));
      if (invocation.jobId) await onInvocationQueued?.(invocation);
      onSummaryChanged?.();
    } catch {
      // Capability runtime failures stay inside the BFF boundary.
      toast.error(t('features.ai.aiView.capabilityInvokeFailed'));
    } finally {
      setInvokingCapabilityId(null);
    }
  }, [onInvocationQueued, onSummaryChanged, t, toast]);

  return {
    invokingCapabilityId,
    latestInvocation,
    clearLatestInvocation,
    invocationProjectId,
    setInvocationProjectId,
    timelineInvocationId,
    setTimelineInvocationId,
    openInvocationTrace,
    invokeCapability,
  };
}
