import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../../services/api';
import { fetchAiInteractions, type AiInteraction } from '../api/interactions';
import { subscribeAgentUiCommands, type AgentUiSubscriptionHandlers } from '../agentEventSocket';
import { useToast } from '../../../components/common/Toast';

// ---------------------------------------------------------------------------
// usePendingInteractions: global pending ask-user/approval count.
//
// Shares the queryKey with AiInteractionCard so the badge, the sidebar card
// and the AI page never run three polls; ws `agent.interaction` pushes
// accelerate the shared cache and a rising count raises a toast. A 403 answer
// (user without ai:* permissions) resolves to an empty list instead of an
// error state.
// ---------------------------------------------------------------------------

/** REST polling fallback cadence; ws `agent.interaction` pushes only accelerate it. */
const PENDING_REFETCH_MS = 15_000;

async function fetchPendingSilently(signal?: AbortSignal): Promise<AiInteraction[]> {
  try {
    return await fetchAiInteractions('pending', signal);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return [];
    throw error;
  }
}

export function usePendingInteractions({
  subscribeInteractions = subscribeAgentUiCommands,
  notify = true,
}: {
  /** Injection point for tests (same pattern as AiInteractionCard). */
  subscribeInteractions?: (handlers: AgentUiSubscriptionHandlers) => () => void;
  /** Toast when the pending count rises; Layout keeps it on, tests may mute it. */
  notify?: boolean;
} = {}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();

  const pendingQuery = useQuery({
    queryKey: ['ai', 'interactions', 'pending'],
    queryFn: ({ signal }) => fetchPendingSilently(signal),
    refetchInterval: PENDING_REFETCH_MS,
  });

  const pending = pendingQuery.data ?? [];
  const previousCount = useRef<number | null>(null);

  // ws acceleration: every agent.interaction push triggers an immediate
  // refetch; without a connection this stays a no-op and polling covers it.
  useEffect(() => subscribeInteractions({
    onInteraction: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai', 'interactions'] });
    },
  }), [queryClient, subscribeInteractions]);

  useEffect(() => {
    if (!notify) return;
    // The baseline is the first resolved read; the pending→data transition
    // on mount must not count as a rise.
    if (pendingQuery.isPending) return;
    if (previousCount.current === null) {
      previousCount.current = pending.length;
      return;
    }
    if (pending.length > previousCount.current) {
      toast.info(t('features.ai.agentSidebar.pendingToast', { count: pending.length }));
    }
    previousCount.current = pending.length;
  }, [notify, pending.length, pendingQuery.isPending, t, toast]);

  return {
    pending,
    pendingCount: pending.length,
    isPending: pendingQuery.isPending,
  };
}
