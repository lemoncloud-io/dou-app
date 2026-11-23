import { transportPlatform } from '@chatic/transport/platform';
import { fakeTransportPorts } from '@chatic/transport/testing/platform';
import 'fake-indexeddb/auto';

import { waitFor } from '@testing-library/react';
import { createClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';
import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

import { DataManager } from '@chatic/runtime-core/data/DataManager';
import { localCachePlatform } from '@chatic/runtime-core/data/localCachePlatform';
import { runtimeStores } from '@chatic/runtime-core/storage/runtimeStores';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { IndexedDBAdapter, IndexedDBDatabase } from '@chatic/db';
import { MemoryStore } from '@chatic/storage';
import { getGlobalSessionContext, getUidInCloud } from '@chatic/session/store';
import { SocketManager } from '@chatic/transport/socket/SocketManager';
import { getSocketManager } from '@chatic/transport/socket/runtime';
import { syncDataGraph } from '@chatic/sync/dataGraph';
import type { SocketBindingConfig } from '@chatic/transport/socket/types';
import { slotKeyOf } from '@chatic/transport/socket/utils/slotKey';
import { BackgroundReceiver } from '@chatic/sync/BackgroundReceiver';
import { subscribeBackgroundDeltas } from '@chatic/sync/backgroundDeltas';
import type { BackgroundDelta } from '@chatic/sync/types';

if (typeof globalThis.structuredClone !== 'function') {
    globalThis.structuredClone = ((value: unknown) => JSON.parse(JSON.stringify(value))) as typeof structuredClone;
}

jest.mock('@lemoncloud/chatic-sockets-lib', () => ({
    ...jest.requireActual('@lemoncloud/chatic-sockets-lib'),
    createClientSocketV2: jest.fn(),
}));
jest.mock('@chatic/bridges', () => ({
    ...jest.requireActual('@chatic/bridges'),
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@chatic/transport/socket/runtime', () => ({ getSocketManager: jest.fn() }));
jest.mock('@chatic/sync/dataGraph', () => ({ syncDataGraph: { get: jest.fn() } }));
jest.mock('@chatic/runtime-core/data/factories/httpFactory', () => ({
    createHttpDataSources: () => ({ httpDataSources: {} }),
}));
jest.mock('@chatic/session/store', () => ({
    ...jest.requireActual('@chatic/session/store'),
    getGlobalSessionContext: jest.fn(),
    getUidInCloud: jest.fn(),
    getCommittedCloudId: jest.fn(),
}));

const mockedCreate = createClientSocketV2 as jest.MockedFunction<typeof createClientSocketV2>;
const UIDS: Record<string, string> = { default: 'uid-relay', 'cloud-a': 'uid-a', 'cloud-b': 'uid-b' };
const A = slotKeyOf('cloud-a');
const B = slotKeyOf('cloud-b');

interface FakeClient {
    syncRequests: Array<{ since: number }>;
    answers: unknown[];
    request: jest.Mock;
    connect: jest.Mock;
    emit(type: string, data: unknown): void;
}

const makeClient = (): FakeClient & Record<string, unknown> => {
    const pushListeners = new Map<string, Set<(message: unknown) => void>>();
    const syncRequests: Array<{ since: number }> = [];
    const answers: unknown[] = [];
    const client = {
        syncRequests,
        answers,
        request: jest.fn(async (type: string, data: { since: number }): Promise<unknown> => {
            if (type === 'user.my-site') return { list: [] };
            if (type !== 'channel.sync') throw new Error(`unexpected ${type}`);
            syncRequests.push(data);
            return answers.shift() ?? { list: [], syncedAt: data.since };
        }),
        onType: jest.fn((type: string, listener: (message: unknown) => void) => {
            const set = pushListeners.get(type) ?? new Set();
            set.add(listener);
            pushListeners.set(type, set);
            return () => set.delete(listener);
        }),
        emit(type: string, data: unknown): void {
            for (const listener of [...(pushListeners.get(type) ?? [])]) listener({ type, data });
        },
        send: jest.fn(),
        onState: jest.fn().mockReturnValue(jest.fn()),
        onError: jest.fn().mockReturnValue(jest.fn()),
        onMessage: jest.fn().mockReturnValue(jest.fn()),
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn(),
        state: 'connected',
    };
    return client;
};

const config = (cid: string): SocketBindingConfig => ({
    url: `wss://${cid}`,
    deviceId: 'device-1',
    wssType: cid === 'default' ? 'relay' : 'cloud',
    cid,
});

const room = (id: string, sid: string, name: string) => ({ id, name, sid, $: { sid }, updatedAt: 1 });

const flush = async () => {
    for (let i = 0; i < 5; i += 1) await new Promise(resolve => setTimeout(resolve, 0));
};

beforeEach(() => {
    transportPlatform.configure(fakeTransportPorts());
    runtimeStores.configure({ device: new MemoryStore() });
    const database = new IndexedDBDatabase();
    localCachePlatform.configure({
        route: () => 'web',
        storage: (type, _route, provider) => new IndexedDBAdapter(database, type, provider) as never,
        routed: () => undefined,
        globalSearch: () => ({}) as never,
        metrics: () => ({}) as never,
    });
});

describe('background receive — a cloud off screen keeps its own partition current', () => {
    let manager: SocketManager;
    let data: DataManager;
    let clients: Map<string, FakeClient>;
    let receiver: BackgroundReceiver;
    let selected: string;
    let run = 0;

    const bind = (cid: string) => manager.ensure(config(cid));
    const clientOf = (cid: string): FakeClient => {
        const client = clients.get(cid);
        if (!client) throw new Error(`no client for ${cid}`);
        return client;
    };
    const verify = (cid: string) => manager.setAuthenticated(slotKeyOf(cid), true);

    beforeEach(() => {
        jest.clearAllMocks();
        clients = new Map();
        mockedCreate.mockImplementation(((options: { url: string }) => {
            const cid = new URL(options.url).hostname;
            const client = makeClient();
            clients.set(cid, client);
            return client as unknown as ClientSocketV2;
        }) as never);
        manager = new SocketManager();
        (getSocketManager as jest.Mock).mockReturnValue(manager);
        selected = 'cloud-b';
        run += 1;
        const uidOf = (cid: string): string | null => (UIDS[cid] ? `${UIDS[cid]}-${run}` : null);
        (getGlobalSessionContext as jest.Mock).mockImplementation(() => ({
            cloud: { cloudId: selected },
            identity: { userId: uidOf(selected) },
        }));
        (getUidInCloud as jest.Mock).mockImplementation(uidOf);
        data = new DataManager();
        (syncDataGraph.get as jest.Mock).mockReturnValue(data);
    });

    afterEach(() => {
        receiver?.destroy();
    });

    it('S8 — a burst of pushes on A becomes one delta, written into A with its cursor, while B is on screen', async () => {
        bind('default');
        bind('cloud-b');
        bind('cloud-a');
        manager.setActiveSlot(B);
        for (const cid of ['default', 'cloud-a', 'cloud-b']) verify(cid);
        const clientA = clientOf('cloud-a');
        receiver = new BackgroundReceiver(manager, { debounceMs: 20 });
        await waitFor(() => expect(clientA.syncRequests).toEqual([{ since: 0 }]));
        await flush();

        clientA.answers.push({ list: [room('ch-1', 'site-a', 'general')], ids: ['ch-1'], syncedAt: 500 });
        clientA.emit('chat.sync', { channelId: 'ch-1', chatNo: 1 });
        clientA.emit('chat.sync', { channelId: 'ch-1', chatNo: 2 });
        clientA.emit('chat.sync', { channelId: 'ch-1', chatNo: 3 });

        const graphA = data.getScopedRepositories('cloud-a');
        await waitFor(async () => expect(await graphA.syncMeta.getSyncedAt('channel-sync:cloud-a')).toBe(500));
        expect(clientA.syncRequests).toEqual([{ since: 0 }, { since: 0 }]);
        const inA = await graphA.channel.cacheReadList({});
        expect(inA?.list.map(row => [row.id, row.cid, row.name])).toEqual([['ch-1', 'cloud-a', 'general']]);
        await expect(graphA.syncMeta.getSyncedAt('channel-sync:cloud-a')).resolves.toBe(500);

        const app = data.getRepositories();
        const inB = await app.channel.cacheReadList({});
        expect(inB?.list ?? []).toEqual([]);
        await expect(app.syncMeta.getSyncedAt('channel-sync:cloud-a')).resolves.toBe(0);
        expect(clientOf('cloud-b').syncRequests).toEqual([]);
    });

    it('S9 — entering A reuses its socket, stops its loop, and continues from the cursor the loop left', async () => {
        bind('default');
        bind('cloud-b');
        bind('cloud-a');
        manager.setActiveSlot(B);
        for (const cid of ['default', 'cloud-a', 'cloud-b']) verify(cid);
        const clientA = clientOf('cloud-a');
        clientA.answers.push({ list: [room('ch-1', 'site-a', 'general')], ids: ['ch-1'], syncedAt: 500 });
        receiver = new BackgroundReceiver(manager, { debounceMs: 20 });
        const graphA = data.getScopedRepositories('cloud-a');
        await waitFor(async () => expect(await graphA.syncMeta.getSyncedAt('channel-sync:cloud-a')).toBe(500));
        expect(clientA.syncRequests).toHaveLength(1);

        selected = 'cloud-a';
        expect(bind('cloud-a')).toBe(clientA);
        manager.setActiveSlot(A);
        clientA.emit('chat.sync', { channelId: 'ch-1', chatNo: 4 });
        await new Promise(resolve => setTimeout(resolve, 60));
        await flush();

        expect(clientA.syncRequests).toHaveLength(1);
        expect(clientA.connect).toHaveBeenCalledTimes(0);
        const app = data.getRepositories();
        const rows = await app.channel.cacheReadList({});
        expect(rows?.list.map(row => row.id)).toEqual(['ch-1']);
        await expect(app.syncMeta.getSyncedAt('channel-sync:cloud-a')).resolves.toBe(500);

        const clientB = clientOf('cloud-b');
        await waitFor(() => expect(clientB.syncRequests).toEqual([{ since: 0 }]));
    });

    it('S11 (runtime half) — a kick after a push is announced once A has written the head and my cursor the count needs', async () => {
        bind('default');
        bind('cloud-b');
        bind('cloud-a');
        manager.setActiveSlot(B);
        for (const cid of ['default', 'cloud-a', 'cloud-b']) verify(cid);
        const clientA = clientOf('cloud-a');
        clientA.answers.push({ list: [room('ch-1', 'site-a', 'general')], ids: ['ch-1'], syncedAt: 500 });
        const deltas: BackgroundDelta[] = [];
        const off = subscribeBackgroundDeltas(delta => {
            if (delta.cid === 'cloud-a') deltas.push(delta);
        });
        receiver = new BackgroundReceiver(manager, { debounceMs: 20 });
        await waitFor(() => expect(deltas).toHaveLength(1));

        const markedAt = Date.now();
        clientA.answers.push({
            list: [{ ...room('ch-1', 'site-a', 'general'), chatNo: 7, $join: { channelId: 'ch-1', chatNo: 5 } }],
            ids: ['ch-1'],
            syncedAt: 900,
        });
        receiver.receiveNow('cloud-a');

        await waitFor(() => expect(deltas).toHaveLength(2));
        off();
        expect(deltas[1].requestedAt).toBeGreaterThanOrEqual(markedAt);
        const rows = await data.getScopedRepositories('cloud-a').channel.cacheReadList({});
        const row = rows?.list[0] as { chatNo?: number; $join?: { chatNo?: number } } | undefined;
        expect(row?.chatNo).toBe(7);
        expect(row?.$join?.chatNo).toBe(5);
        expect(clientOf('cloud-b').syncRequests).toEqual([]);
    });
});
