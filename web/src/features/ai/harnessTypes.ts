// ---------------------------------------------------------------------------
// dsh (DeepSeek Harness) runtime + capability invocation trace types.
//
// Contract source: GET /api/ai/harness/status, GET /api/ai/capabilities/invocations,
// GET /api/ai/capabilities/invocations/:id (frozen backend contract, rc.6).
// Responses are normalized in harnessModel.ts before reaching components.
// ---------------------------------------------------------------------------

/** Plugin entry inside the dsh composition pipeline. */
export interface AiHarnessPlugin {
  id: string;
  name: string;
  /** 'builtin' | 'company' in the frozen contract; unknown kinds render company-styled. */
  kind: string;
}

export interface AiHarnessComposition {
  id: string;
  sdkVersion: string;
  plugins: AiHarnessPlugin[];
}

export interface AiHarnessProxy {
  started: boolean;
  activeRoutes: number;
}

export interface AiHarnessRuntime {
  active: boolean;
  /** Calls served by the current runtime (per-runtime window). */
  activeCalls: number;
  /**
   * Per-runtime run cap. Sprint 3 semantics: 0 = persistent runtime with no
   * cap; a positive integer keeps the old bounded-reuse meaning.
   */
  maxRunsPerRuntime: number;
  queued: number;
  proxy: AiHarnessProxy;
  /** Cumulative calls over the whole process lifetime; absent on pre-Sprint-3 backends. */
  totalCalls?: number;
  /** Cumulative created runtimes ("换血" count); absent on pre-Sprint-3 backends. */
  totalRuns?: number;
}

export interface AiHarnessStatus {
  composition: AiHarnessComposition;
  runtime: AiHarnessRuntime;
  tokenUsageService: boolean;
}

/** Invocation summary row shared by the list and detail envelopes. */
export interface AiInvocationSummary {
  id: string;
  capabilityId?: string;
  capabilityVersion?: string;
  status: string;
  projectId?: string;
  actorId?: string;
  errorCode?: string;
  createdAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface AiInvocationListResult {
  items: AiInvocationSummary[];
  total: number;
}

/** Harness execution trace event (dsh rc.6 event stream). */
export interface AiInvocationEvent {
  /** Event type, e.g. turn/end | assistant/message | tool/call | <unknown>. */
  type: string;
  seq: number;
  time: string | null;
  data: Record<string, unknown> | null;
}

export interface AiInvocationTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AiInvocationDetail extends AiInvocationSummary {
  events: AiInvocationEvent[];
  tokenUsage: AiInvocationTokenUsage;
  result: Record<string, unknown> | null;
}
