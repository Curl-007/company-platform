import { getToken } from '../../services/api';
import type { AiInvocationEvent } from './harnessTypes';

// ---------------------------------------------------------------------------
// Realtime agent event stream client (Sprint 3).
//
// Reuses the platform's existing WebSocket channel conventions (identical to
// the document collaboration editor): ws/wss on the current host, channel path
// under /ws/<name>, JWT attached through the Sec-WebSocket-Protocol pair
// ['pm.jwt', token] (query-token auth is rejected in production).
//
// Frozen message contract:
//   client → server : { type: 'agent.subscribe',   invocationId }
//                   | { type: 'agent.unsubscribe', invocationId }
//   server → client : { type: 'agent.subscribed', invocationId }
//                   | { type: 'agent.event', invocationId, event: { type, seq, time, data } }
//                   | { type: 'agent.error', code, message }
//
// Every onError is fatal for its subscription: callers silently fall back to
// HTTP polling instead of retrying the stream.
//
// Backward-compatible extension (AI UI control): the same socket also carries
// a user-level "ui directive" channel and server-initiated interaction pushes.
//   client → server : { type: 'agent.subscribeUi' }        (server checks ai:*)
//                   | { type: 'agent.unsubscribeUi' }
//   server → client : { type: 'agent.subscribedUi' }
//                   | { type: 'agent.ui', directive: { kind, ... } }
//                   | { type: 'agent.interaction', invocationId, interaction }
// Ui-channel messages have no invocationId and no ack budget: directives are
// best-effort (dropped while disconnected) and consumers validate payloads.
// agent.interaction is routed to the matching invocation subscription's
// optional onInteraction handler and mirrored to every ui-channel subscriber.
// ---------------------------------------------------------------------------

const SOCKET_PATH = '/ws/agent';
const READY_STATE_CONNECTING = 0;
const READY_STATE_OPEN = 1;
/** Fall back to polling if no agent.subscribed ack arrives within this budget (connects + reconnects included). */
export const AGENT_SUBSCRIBE_TIMEOUT_MS = 5_000;
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 15_000;

/** Same wire shape as detail-endpoint events (dsh SessionEvent). */
export type AgentSocketEvent = AiInvocationEvent;

export interface AgentSocketError {
  code: string;
  message: string;
}

export interface AgentEventSubscriptionHandlers {
  /** Fires after every successful (re)subscription for this invocation. */
  onSubscribed?: () => void;
  onEvent: (event: AgentSocketEvent) => void;
  /**
   * Server-initiated ask-user/approval push (agent.interaction). Optional so
   * existing trace consumers stay unaffected; payloads are not parsed here.
   */
  onInteraction?: (interaction: unknown, invocationId: string) => void;
  /** Fatal for this subscription: the caller should fall back to polling. */
  onError: (error: AgentSocketError) => void;
}

/** Wire directive payload of an agent.ui message (validated by the consumer). */
export type AgentUiDirectivePayload = Record<string, unknown>;

/** Server-pushed interaction as seen by ui-channel subscribers. */
export interface AgentUiInteractionMessage {
  invocationId: string | null;
  interaction: unknown;
}

export interface AgentUiSubscriptionHandlers {
  /** Every agent.ui directive addressed to the logged-in user. */
  onUiDirective?: (directive: AgentUiDirectivePayload) => void;
  /** agent.interaction pushes (acceleration only; REST polling stays the fallback). */
  onInteraction?: (message: AgentUiInteractionMessage) => void;
}

/** Subset of the native WebSocket API this module relies on (mock friendly). */
export interface AgentSocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

export type AgentSocketFactory = (url: string, protocols: string[]) => AgentSocketLike;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function defaultAgentSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${SOCKET_PATH}`;
}

function defaultSocketFactory(url: string, protocols: string[]): AgentSocketLike {
  // The native WebSocket's event-bearing handler signatures are wider than the
  // minimal AgentSocketLike contract; this boundary adapter only narrows types.
  return new WebSocket(url, protocols) as unknown as AgentSocketLike;
}

/**
 * Shared-connection manager for agent event subscriptions. One socket carries
 * every active invocationId; dropped connections reconnect with exponential
 * backoff and automatically re-subscribe the pending set.
 */
export class AgentEventSocket {
  private readonly resolveUrl: () => string;
  private readonly createSocket: AgentSocketFactory;
  private readonly subscribeTimeoutMs: number;
  private readonly listeners = new Map<string, Set<AgentEventSubscriptionHandlers>>();
  private readonly ackTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly uiListeners = new Set<AgentUiSubscriptionHandlers>();
  private socket: AgentSocketLike | null = null;
  private intentionalClose = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** True between sending agent.subscribeUi and the connection dropping. */
  private uiSubscribed = false;

  constructor(options: {
    url?: () => string;
    socketFactory?: AgentSocketFactory;
    subscribeTimeoutMs?: number;
  } = {}) {
    this.resolveUrl = options.url ?? defaultAgentSocketUrl;
    this.createSocket = options.socketFactory ?? defaultSocketFactory;
    this.subscribeTimeoutMs = options.subscribeTimeoutMs ?? AGENT_SUBSCRIBE_TIMEOUT_MS;
  }

  /**
   * Subscribes to an invocation's live event stream. Multiple subscriptions
   * share one connection. Returns an idempotent unsubscribe function.
   */
  subscribe(invocationId: string, handlers: AgentEventSubscriptionHandlers): () => void {
    let invocationListeners = this.listeners.get(invocationId);
    if (!invocationListeners) {
      invocationListeners = new Set();
      this.listeners.set(invocationId, invocationListeners);
    }
    invocationListeners.add(handlers);

    if (!getToken()) {
      this.removeSubscription(invocationId, handlers);
      handlers.onError({ code: 'AGENT_AUTH_MISSING', message: 'No auth token available for the realtime stream.' });
      return () => undefined;
    }

    this.connect();
    // Arm the ack budget immediately (even while still connecting) so a stuck
    // socket still degrades to polling within the timeout.
    this.armAckTimer(invocationId);
    if (this.socket?.readyState === READY_STATE_OPEN) {
      this.send({ type: 'agent.subscribe', invocationId });
    }
    return () => this.removeSubscription(invocationId, handlers);
  }

  /**
   * Subscribes to the user-level ui directive channel (agent.ui /
   * agent.interaction). Shares the invocation connection; reconnects
   * automatically re-send agent.subscribeUi. Returns an idempotent
   * unsubscribe function. Directives are best-effort: no delivery while the
   * socket is down, no ack budget, no onError (polling is not applicable).
   */
  subscribeUi(handlers: AgentUiSubscriptionHandlers): () => void {
    if (!getToken()) return () => undefined;
    this.uiListeners.add(handlers);
    this.connect();
    this.sendSubscribeUi();
    return () => this.removeUiSubscription(handlers);
  }

  /** Drops the shared connection and all subscription state (test/teardown helper). */
  reset(): void {
    this.listeners.clear();
    this.uiListeners.clear();
    this.uiSubscribed = false;
    this.teardown();
  }

  private connect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (
      this.socket
      && (this.socket.readyState === READY_STATE_CONNECTING || this.socket.readyState === READY_STATE_OPEN)
    ) {
      return;
    }
    const token = getToken();
    if (!token) return; // callers were already notified at subscribe time
    this.intentionalClose = false;
    const socket = this.createSocket(this.resolveUrl(), ['pm.jwt', token]);
    this.socket = socket;
    socket.onopen = () => this.handleOpen();
    socket.onmessage = (event) => this.handleMessage(event);
    socket.onclose = () => this.handleClose(socket);
    socket.onerror = () => {
      /* the browser always follows onerror with onclose; reconnect is handled there */
    };
  }

  private handleOpen(): void {
    this.reconnectAttempts = 0;
    for (const invocationId of this.listeners.keys()) {
      this.sendSubscribe(invocationId);
    }
    // Reconnects re-arm the ui channel too (subscribeUi is idempotent).
    if (this.uiListeners.size > 0) this.sendSubscribeUi();
  }

  private sendSubscribeUi(): void {
    if (this.uiSubscribed) return;
    if (this.socket?.readyState !== READY_STATE_OPEN) return;
    this.send({ type: 'agent.subscribeUi' });
    this.uiSubscribed = true;
  }

  private sendSubscribe(invocationId: string): void {
    this.send({ type: 'agent.subscribe', invocationId });
    this.armAckTimer(invocationId);
  }

  /** One 5s budget per subscribe covers the whole ack wait, reconnects included. */
  private armAckTimer(invocationId: string): void {
    if (this.ackTimers.has(invocationId)) return;
    const timer = setTimeout(() => this.handleAckTimeout(invocationId), this.subscribeTimeoutMs);
    this.ackTimers.set(invocationId, timer);
  }

  private handleAckTimeout(invocationId: string): void {
    this.ackTimers.delete(invocationId);
    const invocationListeners = this.listeners.get(invocationId);
    if (!invocationListeners) return;
    this.listeners.delete(invocationId);
    const error: AgentSocketError = {
      code: 'AGENT_SUBSCRIBE_TIMEOUT',
      message: 'Realtime stream subscription timed out.',
    };
    for (const handlers of invocationListeners) handlers.onError(error);
    if (this.listeners.size === 0 && this.uiListeners.size === 0) this.teardown();
  }

  private handleMessage(event: { data: unknown }): void {
    let payload: unknown;
    try {
      payload = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (!isRecord(payload)) return;
    if (payload.type === 'agent.subscribed') this.handleSubscribed(payload);
    else if (payload.type === 'agent.event') this.handleAgentEvent(payload);
    else if (payload.type === 'agent.error') this.handleAgentError(payload);
    else if (payload.type === 'agent.subscribedUi') this.handleSubscribedUi();
    else if (payload.type === 'agent.ui') this.handleAgentUi(payload);
    else if (payload.type === 'agent.interaction') this.handleAgentInteraction(payload);
  }

  private handleSubscribedUi(): void {
    this.uiSubscribed = true;
  }

  private handleAgentUi(payload: Record<string, unknown>): void {
    // Malformed directives are dropped here; consumers never see them.
    if (!isRecord(payload.directive)) return;
    for (const handlers of this.uiListeners) handlers.onUiDirective?.(payload.directive);
  }

  private handleAgentInteraction(payload: Record<string, unknown>): void {
    const invocationId = asString(payload.invocationId);
    const interaction: unknown = 'interaction' in payload ? payload.interaction : null;
    if (invocationId) {
      const invocationListeners = this.listeners.get(invocationId);
      if (invocationListeners) {
        for (const handlers of invocationListeners) handlers.onInteraction?.(interaction, invocationId);
      }
    }
    // Ui-channel subscribers (e.g. the interaction card) have no invocation
    // subscription of their own, so the envelope is mirrored to all of them.
    for (const handlers of this.uiListeners) handlers.onInteraction?.({ invocationId, interaction });
  }

  private handleSubscribed(payload: Record<string, unknown>): void {
    const invocationId = asString(payload.invocationId);
    if (!invocationId) return;
    const timer = this.ackTimers.get(invocationId);
    if (timer) clearTimeout(timer);
    this.ackTimers.delete(invocationId);
    const invocationListeners = this.listeners.get(invocationId);
    if (!invocationListeners) return;
    for (const handlers of invocationListeners) handlers.onSubscribed?.();
  }

  private handleAgentEvent(payload: Record<string, unknown>): void {
    const invocationId = asString(payload.invocationId);
    const eventRecord = isRecord(payload.event) ? payload.event : null;
    if (!invocationId || !eventRecord) return;
    const type = asString(eventRecord.type);
    const seq = typeof eventRecord.seq === 'number' && Number.isSafeInteger(eventRecord.seq) && eventRecord.seq >= 0
      ? eventRecord.seq
      : null;
    if (!type || seq === null) return; // malformed events are dropped, never thrown
    const agentEvent: AgentSocketEvent = {
      type,
      seq,
      time: asString(eventRecord.time),
      data: isRecord(eventRecord.data) ? eventRecord.data : null,
    };
    const invocationListeners = this.listeners.get(invocationId);
    if (!invocationListeners) return;
    for (const handlers of invocationListeners) handlers.onEvent(agentEvent);
  }

  private handleAgentError(payload: Record<string, unknown>): void {
    const code = asString(payload.code) ?? 'AGENT_ERROR';
    const message = asString(payload.message) ?? 'Realtime agent stream error.';
    const scopedId = asString(payload.invocationId);
    if (scopedId) {
      // Error scoped to one invocation: only that subscription falls back.
      const invocationListeners = this.listeners.get(scopedId);
      if (!invocationListeners) return;
      this.listeners.delete(scopedId);
      const timer = this.ackTimers.get(scopedId);
      if (timer) clearTimeout(timer);
      this.ackTimers.delete(scopedId);
      for (const handlers of invocationListeners) handlers.onError({ code, message });
      if (this.listeners.size === 0) this.teardown();
      return;
    }
    const error: AgentSocketError = { code, message };
    const allListeners = [...this.listeners.values()];
    this.listeners.clear();
    // A connection-level error also ends the ui channel; its consumers are
    // best-effort by design (REST polling / next reconnect covers them).
    this.uiListeners.clear();
    this.uiSubscribed = false;
    for (const timer of this.ackTimers.values()) clearTimeout(timer);
    this.ackTimers.clear();
    for (const invocationListeners of allListeners) {
      for (const handlers of invocationListeners) handlers.onError(error);
    }
    this.teardown();
  }

  private handleClose(socket: AgentSocketLike): void {
    // A replaced/teardown socket closing late must not disturb the current one.
    if (this.socket !== socket) return;
    this.socket = null;
    this.uiSubscribed = false;
    if (this.intentionalClose || (this.listeners.size === 0 && this.uiListeners.size === 0)) return;
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts, RECONNECT_MAX_DELAY_MS);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private removeSubscription(invocationId: string, handlers: AgentEventSubscriptionHandlers): void {
    const invocationListeners = this.listeners.get(invocationId);
    if (!invocationListeners || !invocationListeners.delete(handlers)) return;
    if (invocationListeners.size > 0) return;
    this.listeners.delete(invocationId);
    const timer = this.ackTimers.get(invocationId);
    if (timer) clearTimeout(timer);
    this.ackTimers.delete(invocationId);
    if (this.socket?.readyState === READY_STATE_OPEN) {
      this.send({ type: 'agent.unsubscribe', invocationId });
    }
    if (this.listeners.size === 0 && this.uiListeners.size === 0) this.teardown();
  }

  private removeUiSubscription(handlers: AgentUiSubscriptionHandlers): void {
    if (!this.uiListeners.delete(handlers)) return;
    if (this.uiListeners.size > 0) return;
    if (this.socket?.readyState === READY_STATE_OPEN && this.uiSubscribed) {
      this.send({ type: 'agent.unsubscribeUi' });
    }
    this.uiSubscribed = false;
    if (this.listeners.size === 0) this.teardown();
  }

  private teardown(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const timer of this.ackTimers.values()) clearTimeout(timer);
    this.ackTimers.clear();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState <= READY_STATE_OPEN) {
      socket.close(1000, 'client unsubscribe');
    }
  }

  private send(message: Record<string, unknown>): void {
    if (this.socket?.readyState !== READY_STATE_OPEN) return;
    this.socket.send(JSON.stringify(message));
  }
}

/** Shared singleton; the drawer opens at most one subscription at a time. */
export const agentEventSocket = new AgentEventSocket();

export function subscribeAgentEvents(
  invocationId: string,
  handlers: AgentEventSubscriptionHandlers,
): () => void {
  return agentEventSocket.subscribe(invocationId, handlers);
}

/** Subscribe to user-level agent.ui directives / agent.interaction pushes. */
export function subscribeAgentUiCommands(handlers: AgentUiSubscriptionHandlers): () => void {
  return agentEventSocket.subscribeUi(handlers);
}

/** Test hook: drop the shared connection so a clean slate is restored between cases. */
export function resetAgentEventSocket(): void {
  agentEventSocket.reset();
}
