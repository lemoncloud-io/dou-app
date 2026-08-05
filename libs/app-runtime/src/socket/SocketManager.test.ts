import { createClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';
import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

import { SocketManager } from './SocketManager';
import type { SocketBindingConfig } from './types';

// SocketManager is the only owner of createClientSocketV2; mock the value export so
// ensure() yields a controllable fake client (types are erased at runtime).
jest.mock('@lemoncloud/chatic-sockets-lib', () => ({
    createClientSocketV2: jest.fn(),
}));

const mockedCreate = createClientSocketV2 as jest.MockedFunction<typeof createClientSocketV2>;

const makeClient = (overrides: Partial<jest.Mocked<ClientSocketV2>> = {}): jest.Mocked<ClientSocketV2> =>
    ({
        request: jest.fn(),
        send: jest.fn(),
        onType: jest.fn().mockReturnValue(jest.fn()),
        onState: jest.fn().mockReturnValue(jest.fn()),
        onError: jest.fn().mockReturnValue(jest.fn()),
        onMessage: jest.fn().mockReturnValue(jest.fn()),
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn(),
        state: 'connected',
        ...overrides,
    }) as unknown as jest.Mocked<ClientSocketV2>;

const CONFIG: SocketBindingConfig = { url: 'wss://example.test/socket', deviceId: 'device-1' };
const OTHER_CONFIG: SocketBindingConfig = { url: 'wss://example.test/socket', deviceId: 'device-2' };
const REQUEST_ERROR = { errorCode: 401, message: 'UNAUTHORIZED' };

describe('SocketManager request facade', () => {
    beforeEach(() => {
        mockedCreate.mockReset();
    });

    it('routes request() to the current client and returns its result', async () => {
        const client = makeClient();
        client.request.mockResolvedValueOnce('response-data');
        mockedCreate.mockReturnValue(client);

        const manager = new SocketManager();
        manager.ensure(CONFIG, 'relay');

        const result = await manager.request('test.type', { foo: 'bar' });

        expect(client.request).toHaveBeenCalledWith('test.type', { foo: 'bar' }, undefined);
        expect(result).toBe('response-data');
    });

    it('rethrows request errors — recovery is owned by the SDK AuthController, not the request path', async () => {
        const client = makeClient();
        client.request.mockRejectedValueOnce(REQUEST_ERROR);
        mockedCreate.mockReturnValue(client);

        const manager = new SocketManager();
        manager.ensure(CONFIG, 'relay');

        await expect(manager.request('test.type')).rejects.toEqual(REQUEST_ERROR);
        expect(client.request).toHaveBeenCalledTimes(1);
    });

    it('throws when request() is called before a client exists', async () => {
        const manager = new SocketManager();
        await expect(manager.request('test.type')).rejects.toThrow('Socket client not ready');
    });
});

describe('SocketManager error annotation', () => {
    beforeEach(() => {
        mockedCreate.mockReset();
    });

    const bootRelay = (client: jest.Mocked<ClientSocketV2>): SocketManager => {
        mockedCreate.mockReturnValue(client);
        const manager = new SocketManager();
        manager.ensure(CONFIG, 'relay');
        return manager;
    };

    // The whole point: the SDK's transport failure is identical for every caller, so without this the
    // minified production stack cannot say WHICH request raced a closed socket.
    it('names the failing request on an anonymous transport error, keeping the status leading', async () => {
        const client = makeClient();
        client.request.mockRejectedValueOnce(new Error('503 SOCKET NOT CONNECTED - WebSocketTransport.send()'));

        const manager = bootRelay(client);

        const error = await manager.request('chat.feed').catch((e: Error) => e);

        expect(error.message).toBe('503 SOCKET NOT CONNECTED - WebSocketTransport.send() - relay.request(chat.feed)');
        // getSocketErrorCode reads the LEADING code — appending must not displace it.
        expect(error.message).toMatch(/^503/);
    });

    it('labels the scoped facade with the pinned kind, not the active slot', async () => {
        const relay = makeClient();
        const cloud = makeClient();
        relay.request.mockRejectedValueOnce(new Error('503 SOCKET NOT CONNECTED - WebSocketTransport.send()'));
        mockedCreate.mockReturnValueOnce(relay).mockReturnValueOnce(cloud);

        const manager = new SocketManager();
        manager.ensure(CONFIG, 'relay');
        manager.ensure({ url: 'wss://cloud.test/socket', deviceId: 'device-1' }, 'cloud'); // active = cloud

        await expect(manager.getScopedClient('relay').request('invite.list')).rejects.toThrow(
            /- relay\.request\(invite\.list\)$/
        );
    });

    it('annotates a send() that hits a dead socket', () => {
        const client = makeClient({
            send: jest.fn(() => {
                throw new Error('503 SOCKET NOT CONNECTED - WebSocketTransport.send()');
            }),
        });

        const manager = bootRelay(client);

        expect(() => manager.send('device.sync', { tick: 1 })).toThrow(/- relay\.send\(device\.sync\)$/);
    });

    it('leaves a message that already names the type alone (SDK timeouts, and re-annotation)', async () => {
        const client = makeClient();
        client.request.mockRejectedValueOnce(new Error('408 REQUEST TIMEOUT - chat.feed[m-abc]'));

        const manager = bootRelay(client);

        await expect(manager.request('chat.feed')).rejects.toThrow('408 REQUEST TIMEOUT - chat.feed[m-abc]');
    });

    it('passes a non-Error rejection through untouched (no coercion into an Error)', async () => {
        const client = makeClient();
        client.request.mockRejectedValueOnce(REQUEST_ERROR);

        const manager = bootRelay(client);

        await expect(manager.request('chat.feed')).rejects.toEqual(REQUEST_ERROR);
        expect(REQUEST_ERROR.message).toBe('UNAUTHORIZED');
    });
});

describe('SocketManager isVerified derivation', () => {
    beforeEach(() => {
        mockedCreate.mockReset();
    });

    it('derives isVerified = authenticated AND connected, and a drop clears it', () => {
        let stateCb: ((event: { next: string }) => void) | undefined;
        const client = makeClient({
            onState: jest.fn((cb: (event: { next: string }) => void) => {
                stateCb = cb;
                return jest.fn();
            }) as unknown as jest.Mocked<ClientSocketV2>['onState'],
        });
        mockedCreate.mockReturnValue(client);

        const manager = new SocketManager();
        manager.ensure(CONFIG, 'relay'); // client.state === 'connected', not yet authenticated
        expect(manager.getSnapshot().isVerified).toBe(false);

        // authenticated + connected → verified
        manager.setAuthenticated('relay', true);
        expect(manager.getSnapshot().isVerified).toBe(true);

        // de-authenticated → not verified
        manager.setAuthenticated('relay', false);
        expect(manager.getSnapshot().isVerified).toBe(false);

        // authenticated again, then a transport drop clears verification via derivation
        manager.setAuthenticated('relay', true);
        expect(manager.getSnapshot().isVerified).toBe(true);
        stateCb?.({ next: 'closed' });
        expect(manager.getSnapshot().isVerified).toBe(false);
    });
});

describe('SocketManager onType rebinding', () => {
    beforeEach(() => {
        mockedCreate.mockReset();
    });

    it('re-binds owned push subscriptions to the replacement client', () => {
        const first = makeClient();
        const second = makeClient();
        mockedCreate.mockReturnValueOnce(first).mockReturnValueOnce(second);

        const manager = new SocketManager();
        manager.ensure(CONFIG, 'relay');

        const listener = jest.fn();
        manager.onType('chat.sync', listener);
        expect(first.onType).toHaveBeenCalledWith('chat.sync', listener);

        // A different config tears down the old client and builds a fresh one.
        manager.ensure(OTHER_CONFIG, 'relay');
        expect(second.onType).toHaveBeenCalledWith('chat.sync', listener);
    });
});

describe('SocketManager waitUntilVerified', () => {
    beforeEach(() => {
        mockedCreate.mockReset();
    });

    it('resolves true immediately when already verified', async () => {
        mockedCreate.mockReturnValue(makeClient());
        const manager = new SocketManager();
        manager.ensure(CONFIG, 'relay');
        manager.setAuthenticated('relay', true);

        await expect(manager.waitUntilVerified(1000)).resolves.toBe(true);
    });

    it('resolves true once the socket becomes verified before the timeout', async () => {
        mockedCreate.mockReturnValue(makeClient());
        const manager = new SocketManager();
        manager.ensure(CONFIG, 'relay');

        const pending = manager.waitUntilVerified(1000);
        manager.setAuthenticated('relay', true);

        await expect(pending).resolves.toBe(true);
    });

    it('resolves false when the handshake does not complete before the timeout', async () => {
        jest.useFakeTimers();
        mockedCreate.mockReturnValue(makeClient());
        const manager = new SocketManager();
        manager.ensure(CONFIG, 'relay');

        const pending = manager.waitUntilVerified(1000);
        jest.advanceTimersByTime(1000);

        await expect(pending).resolves.toBe(false);
        jest.useRealTimers();
    });

    it('does not flip to false after resolving true, even past the timeout window', async () => {
        jest.useFakeTimers();
        mockedCreate.mockReturnValue(makeClient());
        const manager = new SocketManager();
        manager.ensure(CONFIG, 'relay');

        const pending = manager.waitUntilVerified(1000);
        manager.setAuthenticated('relay', true);
        jest.advanceTimersByTime(5000);

        await expect(pending).resolves.toBe(true);
        jest.useRealTimers();
    });
});

describe('SocketManager waitUntilKindVerified', () => {
    beforeEach(() => {
        mockedCreate.mockReset();
    });

    it('resolves true immediately when that slot is already verified', async () => {
        mockedCreate.mockReturnValue(makeClient());
        const manager = new SocketManager();
        manager.ensure(CONFIG, 'relay');
        manager.setAuthenticated('relay', true);

        await expect(manager.waitUntilKindVerified('relay', 1000)).resolves.toBe(true);
    });

    it('resolves once that slot completes its handshake, even before it is bound', async () => {
        mockedCreate.mockReturnValue(makeClient());
        const manager = new SocketManager();

        // The invite deeplink's case: the waiter starts before SocketBinder has booted the slot.
        const pending = manager.waitUntilKindVerified('relay', 1000);
        manager.ensure(CONFIG, 'relay');
        manager.setAuthenticated('relay', true);

        await expect(pending).resolves.toBe(true);
    });

    it('waits on the named slot, not the active one', async () => {
        jest.useFakeTimers();
        mockedCreate.mockReturnValue(makeClient());
        const manager = new SocketManager();
        manager.ensure(CONFIG, 'relay');
        manager.ensure(OTHER_CONFIG, 'cloud'); // cloud present → cloud is the ACTIVE slot

        const pending = manager.waitUntilKindVerified('relay', 1000);
        // Verifying the active slot must not release a relay waiter — that is the whole point.
        manager.setAuthenticated('cloud', true);
        expect(manager.getSnapshot().isVerified).toBe(true);

        jest.advanceTimersByTime(1000);
        await expect(pending).resolves.toBe(false);
        jest.useRealTimers();
    });

    it('resolves false on timeout rather than rejecting, so callers can proceed best-effort', async () => {
        jest.useFakeTimers();
        mockedCreate.mockReturnValue(makeClient());
        const manager = new SocketManager();
        manager.ensure(CONFIG, 'relay');

        const pending = manager.waitUntilKindVerified('relay', 1000);
        jest.advanceTimersByTime(1000);

        await expect(pending).resolves.toBe(false);
        jest.useRealTimers();
    });
});

describe('SocketManager subscribeKindVerified', () => {
    beforeEach(() => {
        mockedCreate.mockReset();
    });

    it('replays the current value immediately on subscribe', () => {
        mockedCreate.mockReturnValue(makeClient());
        const manager = new SocketManager();
        manager.ensure(CONFIG, 'relay');
        manager.setAuthenticated('relay', true);

        const listener = jest.fn();
        manager.subscribeKindVerified('relay', listener);

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(true);
    });

    // The reactive gap waitUntilKindVerified cannot fill: a `useQuery({ enabled })`-style consumer
    // needs every false→true edge, not just the first one — a relay slot can drop and recover
    // many times over a session.
    it('fires again on every change to that slot, repeatedly — not just once', () => {
        mockedCreate.mockReturnValue(makeClient());
        const manager = new SocketManager();
        manager.ensure(CONFIG, 'relay');

        const listener = jest.fn();
        manager.subscribeKindVerified('relay', listener);
        listener.mockClear(); // drop the immediate replay call

        manager.setAuthenticated('relay', true);
        manager.setAuthenticated('relay', false);
        manager.setAuthenticated('relay', true);

        expect(listener.mock.calls.map(call => call[0])).toEqual([true, false, true]);
    });

    it('ignores changes to a different kind', () => {
        mockedCreate.mockReturnValue(makeClient());
        const manager = new SocketManager();
        manager.ensure(CONFIG, 'relay');
        manager.ensure(OTHER_CONFIG, 'cloud');

        const listener = jest.fn();
        manager.subscribeKindVerified('relay', listener);
        listener.mockClear();

        manager.setAuthenticated('cloud', true);

        expect(listener).not.toHaveBeenCalled();
    });

    it('stops firing after unsubscribe', () => {
        mockedCreate.mockReturnValue(makeClient());
        const manager = new SocketManager();
        manager.ensure(CONFIG, 'relay');

        const listener = jest.fn();
        const unsubscribe = manager.subscribeKindVerified('relay', listener);
        listener.mockClear();
        unsubscribe();

        manager.setAuthenticated('relay', true);

        expect(listener).not.toHaveBeenCalled();
    });
});

describe('SocketManager subscribeClient', () => {
    beforeEach(() => {
        mockedCreate.mockReset();
    });

    it('notifies every client listener on client change (regression: single-slot drop)', () => {
        const client = makeClient();
        mockedCreate.mockReturnValue(client);

        const manager = new SocketManager();
        const first = jest.fn();
        const second = jest.fn();
        manager.subscribeClient(first);
        manager.subscribeClient(second);
        first.mockClear();
        second.mockClear();

        manager.ensure(CONFIG, 'relay');

        expect(first).toHaveBeenCalledWith(client);
        expect(second).toHaveBeenCalledWith(client);
    });
});

describe('SocketManager subscribeSlotClients (per-slot lifecycle)', () => {
    const RELAY_CONFIG: SocketBindingConfig = { url: 'wss://relay.test/socket', deviceId: 'device-1' };
    const CLOUD_CONFIG: SocketBindingConfig = { url: 'wss://cloud.test/socket', deviceId: 'device-1' };

    beforeEach(() => {
        mockedCreate.mockReset();
    });

    it('emits (kind, client) on bind, (kind, null) on teardown, and replays bound slots on subscribe', () => {
        const relay = makeClient();
        const cloud = makeClient();
        mockedCreate.mockReturnValueOnce(relay).mockReturnValueOnce(cloud);

        const manager = new SocketManager();
        manager.ensure(RELAY_CONFIG, 'relay');

        const seen: Array<[string, unknown]> = [];
        manager.subscribeSlotClients((kind, client) => seen.push([kind, client]));
        expect(seen).toEqual([['relay', relay]]); // replay of the already-bound slot

        manager.ensure(CLOUD_CONFIG, 'cloud');
        manager.destroy('cloud');

        expect(seen).toEqual([
            ['relay', relay],
            ['cloud', cloud],
            ['cloud', null],
        ]);
    });

    it('a slot rebuild emits (kind, null) with the OLD client still alive, then (kind, newClient)', () => {
        const first = makeClient();
        const second = makeClient();
        mockedCreate.mockReturnValueOnce(first).mockReturnValueOnce(second);

        const manager = new SocketManager();
        manager.ensure(RELAY_CONFIG, 'relay');

        const seen: Array<unknown> = [];
        manager.subscribeSlotClients((kind, client) => {
            // The null notification must precede client.destroy() so listeners detach cleanly.
            if (client === null) expect(first.destroy).not.toHaveBeenCalled();
            seen.push(client);
        });

        manager.ensure(OTHER_CONFIG, 'relay'); // rebuild (deviceId differs)

        expect(seen).toEqual([first, null, second]);
        expect(first.destroy).toHaveBeenCalledTimes(1);
    });

    it('slot notification precedes the active-client notification for the same mutation', () => {
        const relay = makeClient();
        mockedCreate.mockReturnValueOnce(relay);

        const manager = new SocketManager();
        const order: string[] = [];
        manager.subscribeSlotClients(() => order.push('slot'));
        manager.subscribeClient(client => {
            if (client) order.push('active');
        });

        manager.ensure(RELAY_CONFIG, 'relay');

        expect(order).toEqual(['slot', 'active']);
    });
});

describe('SocketManager dual slots (active facade)', () => {
    const RELAY_CONFIG: SocketBindingConfig = {
        url: 'wss://relay.test/socket',
        deviceId: 'device-1',
        wssType: 'relay',
        cid: 'default',
    };
    const CLOUD_CONFIG: SocketBindingConfig = {
        url: 'wss://cloud.test/socket',
        deviceId: 'device-1',
        wssType: 'cloud',
        cid: 'cloud-1',
    };

    beforeEach(() => {
        mockedCreate.mockReset();
    });

    it('the cloud slot becomes the active facade; relay auth stays in the background', () => {
        const relay = makeClient();
        const cloud = makeClient();
        mockedCreate.mockReturnValueOnce(relay).mockReturnValueOnce(cloud);

        const manager = new SocketManager();
        manager.ensure(RELAY_CONFIG, 'relay');
        manager.setAuthenticated('relay', true);
        expect(manager.getClient()).toBe(relay); // relay is the only slot → active
        expect(manager.getSnapshot().isVerified).toBe(true);

        // Adding the cloud slot flips the active facade to cloud (not yet authenticated).
        manager.ensure(CLOUD_CONFIG, 'cloud');
        expect(manager.getClient()).toBe(cloud);
        expect(manager.getSnapshot().isVerified).toBe(false);
        expect(manager.getBoundCid()).toBe('cloud-1'); // active slot's bound cloud

        manager.setAuthenticated('cloud', true);
        expect(manager.getSnapshot().isVerified).toBe(true);

        // A background relay auth change must NOT affect the active (cloud) facade.
        manager.setAuthenticated('relay', false);
        expect(manager.getSnapshot().isVerified).toBe(true);
    });

    it('destroying the cloud slot falls the active facade back to relay', () => {
        const relay = makeClient();
        const cloud = makeClient();
        mockedCreate.mockReturnValueOnce(relay).mockReturnValueOnce(cloud);

        const manager = new SocketManager();
        manager.ensure(RELAY_CONFIG, 'relay');
        manager.ensure(CLOUD_CONFIG, 'cloud');
        expect(manager.getClient()).toBe(cloud);

        manager.destroy('cloud');
        expect(manager.getClient()).toBe(relay); // relay slot survives
        expect(cloud.destroy).toHaveBeenCalledTimes(1);
        expect(relay.destroy).not.toHaveBeenCalled();
    });

    it('subscribeClient emits the active client and re-emits on every active-slot change', () => {
        const relay = makeClient();
        const cloud = makeClient();
        mockedCreate.mockReturnValueOnce(relay).mockReturnValueOnce(cloud);

        const manager = new SocketManager();
        const seen: Array<unknown> = [];
        manager.subscribeClient(client => seen.push(client)); // immediate: null (no slots yet)

        manager.ensure(RELAY_CONFIG, 'relay'); // active → relay
        manager.ensure(CLOUD_CONFIG, 'cloud'); // active → cloud
        manager.destroy('cloud'); // active → relay

        expect(seen).toEqual([null, relay, cloud, relay]);
    });

    it('rebindCid는 리부트 없이 활성 슬롯의 boundCid를 새 클라우드로 갱신한다 (같은-wss 전환)', () => {
        const relay = makeClient();
        const cloud = makeClient();
        mockedCreate.mockReturnValueOnce(relay).mockReturnValueOnce(cloud);

        const manager = new SocketManager();
        manager.ensure(RELAY_CONFIG, 'relay');
        manager.ensure(CLOUD_CONFIG, 'cloud');
        expect(manager.getBoundCid()).toBe('cloud-1'); // frozen at bind

        // Same-wss switch: url unchanged so ensure() never re-runs; rebindCid must move boundCid.
        manager.rebindCid('cloud', 'cloud-2');
        expect(manager.getBoundCid()).toBe('cloud-2');
    });

    it('rebindCid는 바인딩되지 않은 kind에 대해 무해하게 무시한다', () => {
        const relay = makeClient();
        mockedCreate.mockReturnValueOnce(relay);

        const manager = new SocketManager();
        manager.ensure(RELAY_CONFIG, 'relay');

        expect(() => manager.rebindCid('cloud', 'cloud-x')).not.toThrow();
        expect(manager.getBoundCid()).toBe('default'); // relay slot's cid untouched
    });

    it('isKindVerified는 활성 슬롯이 아니라 대상 슬롯의 인증+연결을 반영한다', () => {
        const relay = makeClient();
        const cloud = makeClient();
        mockedCreate.mockReturnValueOnce(relay).mockReturnValueOnce(cloud);

        const manager = new SocketManager();
        manager.ensure(RELAY_CONFIG, 'relay');
        manager.ensure(CLOUD_CONFIG, 'cloud'); // active facade → cloud

        // Relay is authenticated + connected even though cloud is the active slot.
        manager.setAuthenticated('relay', true);
        expect(manager.isKindVerified('relay')).toBe(true);
        // Cloud is not yet authenticated, so the active snapshot is unverified — but the per-kind
        // query for relay still reports true, which the active-slot snapshot cannot.
        expect(manager.getSnapshot().isVerified).toBe(false);
        expect(manager.isKindVerified('cloud')).toBe(false);

        manager.setAuthenticated('cloud', true);
        expect(manager.isKindVerified('cloud')).toBe(true);
    });

    it('isKindVerified는 바인딩되지 않은 kind에 대해 false를 반환한다', () => {
        const relay = makeClient();
        mockedCreate.mockReturnValueOnce(relay);

        const manager = new SocketManager();
        manager.ensure(RELAY_CONFIG, 'relay');

        expect(manager.isKindVerified('cloud')).toBe(false);
    });
});

describe('SocketManager getScopedClient (kind-scoped routing)', () => {
    const RELAY_CONFIG: SocketBindingConfig = { url: 'wss://relay.test/socket', deviceId: 'device-1' };
    const CLOUD_CONFIG: SocketBindingConfig = { url: 'wss://cloud.test/socket', deviceId: 'device-1' };

    beforeEach(() => {
        mockedCreate.mockReset();
    });

    it('request는 active 슬롯이 cloud여도 지정한 relay 슬롯으로 나간다', async () => {
        const relay = makeClient();
        const cloud = makeClient();
        relay.request.mockResolvedValue('relay-response');
        mockedCreate.mockReturnValueOnce(relay).mockReturnValueOnce(cloud);

        const manager = new SocketManager();
        manager.ensure(RELAY_CONFIG, 'relay');
        manager.ensure(CLOUD_CONFIG, 'cloud'); // active facade = cloud

        const scoped = manager.getScopedClient('relay');
        const result = await scoped.request('device.update-remote', { muted: true });

        expect(relay.request).toHaveBeenCalledWith('device.update-remote', { muted: true }, undefined);
        expect(cloud.request).not.toHaveBeenCalled();
        expect(result).toBe('relay-response');
    });

    it('슬롯 재바인드 후에도 최신 클라이언트로 위임한다 (지연 해석, stale 방지)', async () => {
        const first = makeClient();
        const second = makeClient();
        second.request.mockResolvedValue('fresh');
        mockedCreate.mockReturnValueOnce(first).mockReturnValueOnce(second);

        const manager = new SocketManager();
        manager.ensure(RELAY_CONFIG, 'relay');
        const scoped = manager.getScopedClient('relay'); // captured BEFORE rebind
        manager.ensure(OTHER_CONFIG, 'relay'); // rebuild relay slot (deviceId differs)

        await scoped.request('device.update-remote', { muted: false });

        expect(second.request).toHaveBeenCalled();
        expect(first.request).not.toHaveBeenCalled();
    });

    it('바인딩되지 않은 슬롯 request는 throw한다 (조용한 폴백 없음)', () => {
        const manager = new SocketManager();
        const scoped = manager.getScopedClient('cloud');

        expect(() => scoped.request('device.update-remote', { muted: true })).toThrow(/no cloud slot/);
    });
});
