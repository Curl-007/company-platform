import { unwrapPost } from '../../../services/apiClient';
import type { AgentUiDirective } from '../models/uiDirectiveModel';

// ---------------------------------------------------------------------------
// UI directive test-fire (ai:* REST, POST /api/ai/ui-directives). The server
// fans the directive out to the caller's own connected clients — the same
// agent.ui messages the realtime channel delivers — and reports the count.
// ---------------------------------------------------------------------------

export interface AiUiDirectiveDelivery {
  delivered: number;
}

/** POST /api/ai/ui-directives { directive } → data.{ delivered } */
export async function sendAiUiDirective(directive: AgentUiDirective): Promise<AiUiDirectiveDelivery> {
  const response = await unwrapPost<unknown>('/api/ai/ui-directives', { directive }, { invalidateCache: false });
  const delivered = typeof response === 'object' && response !== null && 'delivered' in response
    ? (response as { delivered?: unknown }).delivered
    : undefined;
  return { delivered: typeof delivered === 'number' && Number.isFinite(delivered) && delivered >= 0 ? Math.floor(delivered) : 0 };
}
