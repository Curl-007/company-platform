import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiJob } from '../types';
import {
  AI_JOB_POLL_INTERVAL_MS,
  AI_JOB_POLL_MAX_BACKOFF_MS,
  aiJobPollingRetryDelay,
  useAiJobPolling,
} from './useAiJobPolling';

function job(status: AiJob['status'], jobId = 'JOB-1'): AiJob {
  return {
    jobId,
    scene: 'document_analysis',
    status,
    progress: status === 'awaiting_review' ? 100 : 50,
    currentStep: status,
    result: {},
    evidence: [],
  };
}

interface PollingState {
  polling: boolean;
  consecutiveErrors: number;
  error: string | null;
}

async function renderPolling(
  initialJob: AiJob | null,
  pollJob: (jobId: string, signal: AbortSignal) => Promise<AiJob>,
  onUpdate = vi.fn<(value: AiJob) => void>(),
  onAwaitingReview = vi.fn<(value: AiJob) => void>(),
): Promise<{
  root: Root;
  state: () => PollingState;
  render: (nextJob: AiJob | null) => Promise<void>;
  onUpdate: typeof onUpdate;
  onAwaitingReview: typeof onAwaitingReview;
}> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let current: PollingState | null = null;

  function Probe({ selectedJob }: { selectedJob: AiJob | null }) {
    current = useAiJobPolling({ job: selectedJob, pollJob, onUpdate, onAwaitingReview });
    return null;
  }

  const render = async (selectedJob: AiJob | null) => {
    await act(async () => root.render(createElement(Probe, { selectedJob })));
  };
  await render(initialJob);

  return {
    root,
    state: () => {
      if (!current) throw new Error('polling hook did not render');
      return current;
    },
    render,
    onUpdate,
    onAwaitingReview,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('useAiJobPolling', () => {
  it('continues active jobs every 1.2s and stops after one awaiting-review callback', async () => {
    const pollJob = vi.fn<(jobId: string, signal: AbortSignal) => Promise<AiJob>>()
      .mockResolvedValueOnce(job('running'))
      .mockResolvedValueOnce(job('awaiting_review'));
    const hook = await renderPolling(job('queued'), pollJob);

    await act(async () => vi.advanceTimersByTimeAsync(AI_JOB_POLL_INTERVAL_MS));
    expect(pollJob).toHaveBeenCalledTimes(1);
    expect(hook.onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'running' }));

    await act(async () => vi.advanceTimersByTimeAsync(AI_JOB_POLL_INTERVAL_MS));
    expect(pollJob).toHaveBeenCalledTimes(2);
    expect(hook.onAwaitingReview).toHaveBeenCalledTimes(1);
    expect(hook.onAwaitingReview).toHaveBeenCalledWith(expect.objectContaining({ status: 'awaiting_review' }));

    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(pollJob).toHaveBeenCalledTimes(2);
    await act(async () => hook.root.unmount());
  });

  it('uses exponential backoff capped at 10s and exposes the third consecutive error', async () => {
    const pollJob = vi.fn<(jobId: string, signal: AbortSignal) => Promise<AiJob>>()
      .mockRejectedValue(new Error('service unavailable'));
    const hook = await renderPolling(job('running'), pollJob);

    await act(async () => vi.advanceTimersByTimeAsync(1_200));
    expect(hook.state()).toMatchObject({ consecutiveErrors: 1, error: null });
    await act(async () => vi.advanceTimersByTimeAsync(1_200));
    expect(hook.state()).toMatchObject({ consecutiveErrors: 2, error: null });
    await act(async () => vi.advanceTimersByTimeAsync(2_400));
    expect(hook.state().consecutiveErrors).toBe(3);
    expect(hook.state().error).toContain('连续刷新失败 3 次');

    expect(aiJobPollingRetryDelay(1)).toBe(1_200);
    expect(aiJobPollingRetryDelay(4)).toBe(9_600);
    expect(aiJobPollingRetryDelay(5)).toBe(AI_JOB_POLL_MAX_BACKOFF_MS);
    expect(aiJobPollingRetryDelay(20)).toBe(AI_JOB_POLL_MAX_BACKOFF_MS);
    await act(async () => hook.root.unmount());
  });

  it('aborts work while hidden, resumes immediately, and cancels again on task switch and unmount', async () => {
    let visibility: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    const signals: AbortSignal[] = [];
    const pollJob = vi.fn<(jobId: string, signal: AbortSignal) => Promise<AiJob>>()
      .mockImplementation((_jobId, signal) => {
        signals.push(signal);
        return new Promise<AiJob>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
        });
      });
    const hook = await renderPolling(job('queued'), pollJob);

    await act(async () => vi.advanceTimersByTimeAsync(AI_JOB_POLL_INTERVAL_MS));
    expect(pollJob).toHaveBeenCalledTimes(1);
    expect(signals[0].aborted).toBe(false);

    visibility = 'hidden';
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(signals[0].aborted).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(pollJob).toHaveBeenCalledTimes(1);

    visibility = 'visible';
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(pollJob).toHaveBeenCalledTimes(2);
    expect(signals[1].aborted).toBe(false);

    await hook.render(job('running', 'JOB-2'));
    expect(signals[1].aborted).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(AI_JOB_POLL_INTERVAL_MS));
    expect(pollJob).toHaveBeenLastCalledWith('JOB-2', expect.any(AbortSignal));

    await act(async () => hook.root.unmount());
    expect(signals[2].aborted).toBe(true);
  });
});
