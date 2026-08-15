import { useQuery } from '@tanstack/react-query';
import { fetchAiHarnessStatus } from '../api/harness';

// ---------------------------------------------------------------------------
// useHarnessStatus: dsh runtime health query extracted from AiRuntimePanel.
//
// Shared queryKey ['ai','harness-status'] means the AI workspace strip and
// the global agent sidebar chip dedupe into one 15s background poll.
// ---------------------------------------------------------------------------

/** dsh runtime health refresh cadence; consumers are passive background data. */
export const HARNESS_STATUS_REFETCH_MS = 15_000;

export function useHarnessStatus() {
  return useQuery({
    queryKey: ['ai', 'harness-status'],
    queryFn: ({ signal }) => fetchAiHarnessStatus(signal),
    refetchInterval: HARNESS_STATUS_REFETCH_MS,
  });
}
