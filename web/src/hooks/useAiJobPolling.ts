import { useEffect, useRef, useState } from 'react';
import type { AiJob } from '../types';
import type { AiJobStatus } from '../constants/enums';

export const AI_JOB_POLL_INTERVAL_MS = 1_200;
export const AI_JOB_POLL_MAX_BACKOFF_MS = 10_000;

const ACTIVE_STATUSES: ReadonlySet<AiJobStatus> = new Set(['queued', 'running', 'retried']);

export function isActiveAiJobStatus(status: AiJobStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

export function aiJobPollingRetryDelay(consecutiveErrors: number): number {
  return Math.min(
    AI_JOB_POLL_INTERVAL_MS * (2 ** Math.max(0, consecutiveErrors - 1)),
    AI_JOB_POLL_MAX_BACKOFF_MS,
  );
}

interface UseAiJobPollingOptions {
  job: AiJob | null;
  pollJob: (jobId: string, signal: AbortSignal) => Promise<AiJob>;
  onUpdate: (job: AiJob) => void;
  onAwaitingReview: (job: AiJob) => void;
}

interface AiJobPollingState {
  polling: boolean;
  consecutiveErrors: number;
  error: string | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

export function useAiJobPolling({
  job,
  pollJob,
  onUpdate,
  onAwaitingReview,
}: UseAiJobPollingOptions): AiJobPollingState {
  const [polling, setPolling] = useState(false);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pollJobRef = useRef(pollJob);
  const onUpdateRef = useRef(onUpdate);
  const onAwaitingReviewRef = useRef(onAwaitingReview);
  pollJobRef.current = pollJob;
  onUpdateRef.current = onUpdate;
  onAwaitingReviewRef.current = onAwaitingReview;

  const jobId = job?.jobId ?? null;
  const active = job ? isActiveAiJobStatus(job.status) : false;

  useEffect(() => {
    setPolling(false);
    setConsecutiveErrors(0);
    setError(null);
    if (!jobId || !active) return undefined;

    let disposed = false;
    let timer: number | null = null;
    let requestController: AbortController | null = null;
    let failures = 0;
    let reviewDelivered = false;

    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };

    const abortRequest = () => {
      const controller = requestController;
      requestController = null;
      controller?.abort();
    };

    const schedule = (delayMs: number) => {
      clearTimer();
      if (disposed || document.visibilityState === 'hidden') return;
      timer = window.setTimeout(() => {
        timer = null;
        void pollOnce();
      }, delayMs);
    };

    const pollOnce = async () => {
      if (disposed || document.visibilityState === 'hidden') return;
      const controller = new AbortController();
      requestController = controller;
      setPolling(true);

      try {
        const latest = await pollJobRef.current(jobId, controller.signal);
        if (disposed || controller.signal.aborted) return;
        failures = 0;
        setConsecutiveErrors(0);
        setError(null);
        onUpdateRef.current(latest);

        if (latest.status === 'awaiting_review' && !reviewDelivered) {
          reviewDelivered = true;
          onAwaitingReviewRef.current(latest);
        }
        if (isActiveAiJobStatus(latest.status)) schedule(AI_JOB_POLL_INTERVAL_MS);
      } catch (reason) {
        if (disposed || controller.signal.aborted) return;
        failures += 1;
        setConsecutiveErrors(failures);
        if (failures >= 3) {
          setError(`AI 任务状态连续刷新失败 ${failures} 次：${errorMessage(reason)}。系统将自动重试。`);
        }
        schedule(aiJobPollingRetryDelay(failures));
      } finally {
        if (requestController === controller) {
          requestController = null;
          if (!disposed) setPolling(false);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        clearTimer();
        abortRequest();
        if (!disposed) setPolling(false);
        return;
      }
      void pollOnce();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    schedule(AI_JOB_POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      clearTimer();
      abortRequest();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [active, jobId]);

  return { polling, consecutiveErrors, error };
}
