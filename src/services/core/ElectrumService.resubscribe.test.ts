import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ElectrumService } from './ElectrumService';

/**
 * Reconnection behaviour, driven through a scripted WebSocket.
 *
 * The regression this guards: server-side subscriptions die with the socket, so after an
 * automatic reconnect every watched address must be re-subscribed — otherwise the wallet looks
 * healthy but silently stops receiving balance updates until the user forces a refresh.
 */

interface RpcRequest {
  id: number;
  method: string;
  params: unknown[];
}

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sent: RpcRequest[] = [];

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(raw: string): void {
    const request = JSON.parse(raw) as RpcRequest;
    this.sent.push(request);
    // Answer inline, like a well-behaved server. Subscribe requests get a status string that
    // differs per socket so the test can tell a re-subscription response from the original.
    const result =
      request.method === 'blockchain.scripthash.subscribe'
        ? `status-from-socket-${FakeWebSocket.instances.indexOf(this)}`
        : null;
    this.onmessage?.({ data: JSON.stringify({ id: request.id, result }) });
  }

  close(code = 1000, reason = ''): void {
    this.onclose?.({ code, reason });
  }

  /** Simulates the server accepting the connection. */
  open(): void {
    this.onopen?.();
  }

  /** Simulates the connection dropping without a clean close. */
  drop(): void {
    this.onclose?.({ code: 1006, reason: 'connection lost' });
  }
}

const ADDRESS = 'RMBnRfw6tV7dC7LS4Lr8JBWvocokzHQNeG';

/** Lets the queued microtasks from resubscribeAll's await-chain run to completion. */
const flushMicrotasks = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};

async function connectedService(): Promise<ElectrumService> {
  const service = new ElectrumService();
  const pending = service.connect();
  FakeWebSocket.instances[0].open();
  await pending;
  return service;
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('reconnection', () => {
  it('re-subscribes every watched address after an unexpected disconnect', async () => {
    const service = await connectedService();

    const updates: Array<{ scripthash: string; status: string }> = [];
    await service.subscribeToAddress(ADDRESS, (data) => updates.push(data));
    expect(updates).toHaveLength(1);
    const scripthash = updates[0].scripthash;

    // The connection drops uncleanly; the first backoff delay is 2 s.
    FakeWebSocket.instances[0].drop();
    await vi.advanceTimersByTimeAsync(2_000);

    const second = FakeWebSocket.instances[1];
    expect(second).toBeDefined();
    second.open();
    await flushMicrotasks();

    // The new socket carries a fresh subscribe for the same scripthash…
    const resubscribed = second.sent.filter(
      (request) => request.method === 'blockchain.scripthash.subscribe',
    );
    expect(resubscribed.map((request) => request.params[0])).toEqual([scripthash]);

    // …and the current status is delivered, so downstream refetches the balance and picks up
    // anything that changed while the connection was down.
    expect(updates).toHaveLength(2);
    expect(updates[1].status).toBe('status-from-socket-1');
  });

  it('re-subscribes all addresses, not just the first', async () => {
    const service = await connectedService();

    const seen: string[] = [];
    await service.subscribeToAddress(ADDRESS, (data) => seen.push(data.scripthash));
    await service.subscribeToAddress('RJNi221gkDstBPUxeeJgtmDY4EXMEj6uvF', (data) =>
      seen.push(data.scripthash),
    );

    FakeWebSocket.instances[0].drop();
    await vi.advanceTimersByTimeAsync(2_000);
    FakeWebSocket.instances[1].open();
    await flushMicrotasks();

    const resubscribed = FakeWebSocket.instances[1].sent
      .filter((request) => request.method === 'blockchain.scripthash.subscribe')
      .map((request) => request.params[0]);

    expect(new Set(resubscribed).size).toBe(2);
  });

  it('does not resubscribe or reconnect after a deliberate disconnect', async () => {
    const service = await connectedService();
    await service.subscribeToAddress(ADDRESS, () => undefined);

    await service.disconnect();
    await vi.advanceTimersByTimeAsync(120_000);

    // No new socket was opened, and the subscription registry was cleared.
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('rejects connect() when the socket closes before it ever opens', async () => {
    // A refused or firewalled connection closes without opening. connect() must settle, or
    // everything awaiting it — including app start-up — hangs on a loading screen forever.
    const service = new ElectrumService();
    const pending = service.connect();

    FakeWebSocket.instances[0].close(1006, 'refused');

    await expect(pending).rejects.toThrow(/closed before opening/);
  });

  it('sends no subscriptions on a first connect with nothing watched', async () => {
    await connectedService();
    await flushMicrotasks();

    const subscribes = FakeWebSocket.instances[0].sent.filter(
      (request) => request.method === 'blockchain.scripthash.subscribe',
    );
    expect(subscribes).toHaveLength(0);
  });
});
