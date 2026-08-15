import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentEventSocket, type AgentSocketLike } from './agentEventSocket';
import { setToken } from '../../services/api';

// ---------------------------------------------------------------------------
// Unit coverage for the shared agent event socket: multi-subscription fan-out,
// reconnect with backoff + auto resubscribe, fatal errors and the ack timeout.

class FakeSocket implements AgentSocketLike {
  readonly url: string;
  readonly protocols: string[];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string, protocols: string[] = []) {
    this.url = url;
    this.protocols = protocols;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.();
  }

  serverOpen(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  serverDrop(): void {
    // Simulate an abrupt transport failure: error followed by close.
    this.onerror?.();
    this.readyState = 3;
    this.onclose?.();
  }

  serverEmit(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  sentMessages(): unknown[] {
    return this.sent.map((raw) => JSON.parse(raw));
  }
}

function createManager() {
  const sockets: FakeSocket[] = [];
  const manager = new AgentEventSocket({
    url: () => 'ws://localhost/ws/agent',
    socketFactory: (url, protocols) => {
      const socket = new FakeSocket(url, protocols);
      sockets.push(socket);
      return socket;
    },
  });
  return { manager, sockets };
}

function handlers(overrides: Partial<{ onEvent: (event: { type: string; seq: number }) => void }> = {}) {
  return {
    onSubscribed: vi.fn(),
    onEvent: overrides.onEvent ?? vi.fn(),
    onError: vi.fn(),
  };
}

beforeEach(() => {
  setToken('test-token');
});

afterEach(() => {
  setToken(null);
  vi.useRealTimers();
});

describe('AgentEventSocket', () => {
  it('shares one connection across invocations and routes events by invocationId', () => {
    const { manager, sockets } = createManager();
    const a = handlers();
    const b = handlers();
    const unsubscribeA = manager.subscribe('INV-A', a);
    manager.subscribe('INV-B', b);

    expect(sockets).toHaveLength(1);
    expect(sockets[0].url).toBe('ws://localhost/ws/agent');
    expect(sockets[0].protocols).toEqual(['pm.jwt', 'test-token']);
    sockets[0].serverOpen();

    const sent = sockets[0].sentMessages();
    expect(sent).toContainEqual({ type: 'agent.subscribe', invocationId: 'INV-A' });
    expect(sent).toContainEqual({ type: 'agent.subscribe', invocationId: 'INV-B' });

    sockets[0].serverEmit({ type: 'agent.subscribed', invocationId: 'INV-A' });
    sockets[0].serverEmit({ type: 'agent.subscribed', invocationId: 'INV-B' });
    expect(a.onSubscribed).toHaveBeenCalledTimes(1);
    expect(b.onSubscribed).toHaveBeenCalledTimes(1);

    const eventA = { type: 'tool/call', seq: 4, time: null, data: { name: 'x' } };
    sockets[0].serverEmit({ type: 'agent.event', invocationId: 'INV-A', event: eventA });
    sockets[0].serverEmit({ type: 'agent.event', invocationId: 'INV-B', event: { type: 'tool/call', seq: 9, time: null, data: null } });
    expect(a.onEvent).toHaveBeenCalledTimes(1);
    expect(a.onEvent).toHaveBeenCalledWith(eventA);
    expect(b.onEvent).toHaveBeenCalledTimes(1);

    // Malformed payloads never throw and never reach subscribers.
    sockets[0].serverEmit('not-json');
    sockets[0].serverEmit({ type: 'agent.event', invocationId: 'INV-A', event: { type: 'tool/call', data: null } });
    expect(a.onEvent).toHaveBeenCalledTimes(1);

    unsubscribeA();
    manager.reset();
  });

  it('reconnects with backoff and resubscribes the pending set', async () => {
    vi.useFakeTimers();
    const { manager, sockets } = createManager();
    const a = handlers();
    const b = handlers();
    manager.subscribe('INV-A', a);
    manager.subscribe('INV-B', b);
    sockets[0].serverOpen();
    sockets[0].serverEmit({ type: 'agent.subscribed', invocationId: 'INV-A' });

    sockets[0].serverDrop();
    expect(sockets).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1000); // first backoff step
    expect(sockets).toHaveLength(2);
    sockets[1].serverOpen();

    // Both subscriptions were re-sent on the new connection.
    const sent = sockets[1].sentMessages();
    expect(sent).toContainEqual({ type: 'agent.subscribe', invocationId: 'INV-A' });
    expect(sent).toContainEqual({ type: 'agent.subscribe', invocationId: 'INV-B' });
    sockets[1].serverEmit({ type: 'agent.subscribed', invocationId: 'INV-A' });
    expect(a.onSubscribed).toHaveBeenCalledTimes(2);

    manager.reset();
  });

  it('closes the shared connection once the last subscriber leaves', () => {
    const { manager, sockets } = createManager();
    const a = handlers();
    const unsubscribeA = manager.subscribe('INV-A', a);
    sockets[0].serverOpen();
    sockets[0].serverEmit({ type: 'agent.subscribed', invocationId: 'INV-A' });

    unsubscribeA();
    expect(sockets[0].sentMessages()).toContainEqual({ type: 'agent.unsubscribe', invocationId: 'INV-A' });
    expect(sockets[0].readyState).toBe(3);
  });

  it('treats unscoped agent.error as fatal for every subscription', () => {
    const { manager, sockets } = createManager();
    const a = handlers();
    const b = handlers();
    manager.subscribe('INV-A', a);
    manager.subscribe('INV-B', b);
    sockets[0].serverOpen();

    sockets[0].serverEmit({ type: 'agent.error', code: 'INVOCATION_NOT_FOUND', message: 'gone' });
    expect(a.onError).toHaveBeenCalledWith({ code: 'INVOCATION_NOT_FOUND', message: 'gone' });
    expect(b.onError).toHaveBeenCalledTimes(1);
    expect(sockets[0].readyState).toBe(3);
  });

  it('falls back after the ack budget even when the socket never opens', async () => {
    vi.useFakeTimers();
    const { manager, sockets } = createManager();
    const a = handlers();
    manager.subscribe('INV-A', a);

    await vi.advanceTimersByTimeAsync(5000);
    expect(a.onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AGENT_SUBSCRIBE_TIMEOUT' }),
    );

    // Fatal: no reconnect attempts afterwards.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sockets).toHaveLength(1);

    manager.reset();
  });

  it('reports a missing auth token instead of connecting', () => {
    setToken(null);
    const { manager, sockets } = createManager();
    const a = handlers();
    manager.subscribe('INV-A', a);

    expect(a.onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AGENT_AUTH_MISSING' }),
    );
    expect(sockets).toHaveLength(0);
  });
});

describe('AgentEventSocket ui directive channel', () => {
  it('subscribes, receives agent.ui directives and unsubscribes', () => {
    const { manager, sockets } = createManager();
    const onUiDirective = vi.fn();
    const unsubscribe = manager.subscribeUi({ onUiDirective });

    sockets[0].serverOpen();
    expect(sockets[0].sentMessages()).toContainEqual({ type: 'agent.subscribeUi' });

    sockets[0].serverEmit({ type: 'agent.subscribedUi' });
    sockets[0].serverEmit({ type: 'agent.ui', directive: { kind: 'theme', mode: 'dark' } });
    expect(onUiDirective).toHaveBeenCalledTimes(1);
    expect(onUiDirective).toHaveBeenCalledWith({ kind: 'theme', mode: 'dark' });

    // Malformed directives never throw and never reach subscribers.
    sockets[0].serverEmit({ type: 'agent.ui' });
    sockets[0].serverEmit({ type: 'agent.ui', directive: 'nope' });
    expect(onUiDirective).toHaveBeenCalledTimes(1);

    unsubscribe();
    const sent = sockets[0].sentMessages();
    expect(sent).toContainEqual({ type: 'agent.unsubscribeUi' });
    // Last subscriber left: the shared connection closes.
    expect(sockets[0].readyState).toBe(3);
  });

  it('re-subscribes the ui channel after a reconnect', async () => {
    vi.useFakeTimers();
    const { manager, sockets } = createManager();
    const onUiDirective = vi.fn();
    manager.subscribeUi({ onUiDirective });
    sockets[0].serverOpen();
    sockets[0].serverEmit({ type: 'agent.subscribedUi' });

    sockets[0].serverDrop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets).toHaveLength(2);
    sockets[1].serverOpen();

    // The ui channel is re-armed on the new connection exactly once.
    const uiSubscribes = sockets[1].sentMessages().filter((message) =>
      (message as { type?: string }).type === 'agent.subscribeUi');
    expect(uiSubscribes).toHaveLength(1);

    sockets[1].serverEmit({ type: 'agent.ui', directive: { kind: 'fontSize', value: 16 } });
    expect(onUiDirective).toHaveBeenCalledWith({ kind: 'fontSize', value: 16 });

    manager.reset();
  });

  it('keeps the connection alive while only ui listeners remain', async () => {
    vi.useFakeTimers();
    const { manager, sockets } = createManager();
    const a = handlers();
    const unsubscribeInvocation = manager.subscribe('INV-A', a);
    const unsubscribeUi = manager.subscribeUi({ onUiDirective: vi.fn() });
    sockets[0].serverOpen();
    sockets[0].serverEmit({ type: 'agent.subscribed', invocationId: 'INV-A' });

    unsubscribeInvocation();
    // The ui listener still needs the connection: no teardown.
    expect(sockets[0].readyState).toBe(1);

    unsubscribeUi();
    expect(sockets[0].readyState).toBe(3);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(sockets).toHaveLength(1);

    manager.reset();
  });

  it('does not subscribe the ui channel without an auth token', () => {
    setToken(null);
    const { manager, sockets } = createManager();
    const unsubscribe = manager.subscribeUi({ onUiDirective: vi.fn() });
    expect(sockets).toHaveLength(0);
    unsubscribe(); // idempotent no-op
  });

  it('routes agent.interaction to invocation and ui subscribers', () => {
    const { manager, sockets } = createManager();
    const onInteraction = vi.fn();
    const uiInteraction = vi.fn();
    manager.subscribe('INV-A', { ...handlers(), onInteraction });
    manager.subscribeUi({ onInteraction: uiInteraction });
    sockets[0].serverOpen();

    const interaction = { interactionId: 'AII-1', kind: 'question', status: 'pending' };
    sockets[0].serverEmit({ type: 'agent.interaction', invocationId: 'INV-A', interaction });

    // Invocation-scoped handler gets (payload, invocationId).
    expect(onInteraction).toHaveBeenCalledTimes(1);
    expect(onInteraction).toHaveBeenCalledWith(interaction, 'INV-A');
    // Ui-channel handler gets the envelope regardless of subscriptions.
    expect(uiInteraction).toHaveBeenCalledTimes(1);
    expect(uiInteraction).toHaveBeenCalledWith({ invocationId: 'INV-A', interaction });

    manager.reset();
  });
});
