import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { fetchAiCapabilityInvocation } from '../api/harness';
import { subscribeAgentEvents, type AgentEventSubscriptionHandlers } from '../agentEventSocket';
import {
  isTerminalInvocationStatus,
  isTerminalTurnEndReason,
  mergeInvocationEvents,
  toInvocationEventViews,
  type InvocationEventView,
} from '../models/harnessModel';
import type { AiInvocationDetail, AiInvocationEvent } from '../harnessTypes';

/** Poll a running invocation's trace until it reaches a terminal status. */
const TRACE_REFETCH_MS = 8_000;

/**
 * Realtime stream state:
 * - connecting: subscription requested, waiting for the agent.subscribed ack
 * - live: subscribed, agent.event messages append to the timeline
 * - fallback: ws unavailable/errored — silently degrades to the 8s poll
 * - off: not streaming (terminal invocation or stream finished)
 */
export type InvocationTraceLiveMode = 'off' | 'connecting' | 'live' | 'fallback';

/** Injection point for tests (same pattern as AgentEventSocket's socketFactory). */
export type SubscribeAgentEvents = (
  invocationId: string,
  handlers: AgentEventSubscriptionHandlers,
) => () => void;

export interface UseInvocationTraceOptions {
  invocationId: string;
  /** Defaults to the shared agent event socket singleton. */
  subscribe?: SubscribeAgentEvents;
}

export interface InvocationTraceState {
  /** Detail query result (status flags for the drawer's loading/error states). */
  detailQuery: UseQueryResult<AiInvocationDetail>;
  detail: AiInvocationDetail | undefined;
  /** Detail + live events merged, deduped by seq and projected to view models. */
  events: InvocationEventView[];
  liveMode: InvocationTraceLiveMode;
  /** True once a terminal turn/end arrived over the stream; never resubscribes afterwards. */
  streamFinalized: boolean;
  invocationRunning: boolean;
}

/**
 * Data hook behind the invocation trace drawer: polls the detail endpoint
 * until a terminal status and, while the invocation runs, overlays the
 * realtime agent event stream. Any ws failure silently degrades to polling.
 */
export function useInvocationTrace({
  invocationId,
  subscribe = subscribeAgentEvents,
}: UseInvocationTraceOptions): InvocationTraceState {
  const queryClient = useQueryClient();
  const [liveEvents, setLiveEvents] = useState<AiInvocationEvent[]>([]);
  const [liveMode, setLiveMode] = useState<InvocationTraceLiveMode>('off');
  const [streamFinalized, setStreamFinalized] = useState(false);
  /** Set when a terminal turn/end arrived over the stream: never resubscribe afterwards. */
  const streamFinalizedRef = useRef(false);
  /** Set once a live subscription was attempted (gates the one final detail pull). */
  const streamAttemptedRef = useRef(false);
  /** Set once the final detail refetch has been triggered. */
  const finalPullDoneRef = useRef(false);

  const detailQuery = useQuery({
    queryKey: ['ai', 'invocation-detail', invocationId],
    queryFn: ({ signal }) => fetchAiCapabilityInvocation(invocationId, signal),
    refetchInterval: (query) => (
      isTerminalInvocationStatus(query.state.data?.status) ? false : TRACE_REFETCH_MS
    ),
  });

  const detail = detailQuery.data;
  const invocationRunning = detail !== undefined && !isTerminalInvocationStatus(detail.status);

  // Reset per-invocation streaming state when the drawer switches traces.
  useEffect(() => {
    streamFinalizedRef.current = false;
    streamAttemptedRef.current = false;
    finalPullDoneRef.current = false;
    setLiveEvents([]);
    setLiveMode('off');
    setStreamFinalized(false);
  }, [invocationId]);

  // Realtime event stream: subscribe while the invocation is running and the
  // stream has not finished; any ws failure silently degrades to polling.
  useEffect(() => {
    if (!invocationRunning || streamFinalizedRef.current) {
      setLiveMode((mode) => (mode === 'off' || mode === 'fallback' ? mode : 'off'));
      return;
    }
    setLiveMode('connecting');
    streamAttemptedRef.current = true;
    const unsubscribe = subscribe(invocationId, {
      onSubscribed: () => setLiveMode('live'),
      onError: () => setLiveMode('fallback'),
      onEvent: (event) => {
        setLiveEvents((previous) => mergeInvocationEvents(previous, [event]));
        if (event.type === 'turn/end' && isTerminalTurnEndReason(event.data)) {
          streamFinalizedRef.current = true;
          finalPullDoneRef.current = true;
          setStreamFinalized(true);
          setLiveMode('off');
          unsubscribe();
          // Final detail pull for result/tokenUsage written after the last event.
          void queryClient.invalidateQueries({ queryKey: ['ai', 'invocation-detail', invocationId] });
        }
      },
    });
    return unsubscribe;
  }, [invocationId, invocationRunning, queryClient, subscribe]);

  // When polling (not the stream) observes the terminal transition, make one
  // final detail pull so the just-written result/tokenUsage complete the summary.
  useEffect(() => {
    if (!detail || invocationRunning || !streamAttemptedRef.current || finalPullDoneRef.current) return;
    finalPullDoneRef.current = true;
    void queryClient.invalidateQueries({ queryKey: ['ai', 'invocation-detail', invocationId] });
  }, [detail, invocationRunning, invocationId, queryClient]);

  const events = useMemo(
    () => (detail ? toInvocationEventViews(mergeInvocationEvents(detail.events, liveEvents)) : []),
    [detail, liveEvents],
  );

  return {
    detailQuery,
    detail,
    events,
    liveMode,
    streamFinalized,
    invocationRunning,
  };
}
