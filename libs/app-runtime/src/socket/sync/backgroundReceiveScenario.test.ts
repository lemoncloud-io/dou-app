// The IndexedDB adapter opens a real database in its constructor, so a shim must exist first.
import 'fake-indexeddb/auto';

/**
 * Background receive, end to end through the real `SocketManager`, the real `BackgroundReceiver`,
 * and the real `DataManager` with its real local data sources on IndexedDB: a cloud the user is not
 * looking at keeps its rooms and its cursor current in its own partition, and the cloud on screen is
 * left alone. Entering that cloud afterwards continues from the cursor the loop left.
 *
 * Faked: the SDK client (its `channel.sync` answers, and the `chat.sync` pushes the test emits), the
 * session store (which cloud is selected and each cloud's uid), and the HTTP data sources, which this
 * path never reaches.
 */
import { waitFor } from '@testing-library/react';
import { createClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';
import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

import { DataManager } from '../../data/DataManager';
import { getDataManager } from '../../data/runtime';
import { getGlobalSessionContext, getUidInCloud } from '../../session/store';
import { SocketManager } from '../SocketManager';
import { getSocketManager } from '../runtime';
import type { SocketBindingConfig } from '../types';
import { slotKeyOf } from '../utils/slotKey';
import { BackgroundReceiver } from './BackgroundReceiver';
import { subscribeBackgroundDeltas } from './backgroundDeltas';
import type { BackgroundDelta } from './types';

// fake-indexeddb clones every value it stores, and jsdom has no structuredClone — the shim libs/db's
// own IndexedDB suites use.
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
jest.mock('../runtime', () => ({ getSocketManager: jest.fn() }));
jest.mock('../../data/runtime', () => ({ getDataManager: jest.fn() }));
jest.mock('../../data/factories/httpFactory', () => ({ createHttpDataSources: () => ({ httpDataSources: {} }) }));
jest.mock('../../session/store', () => ({
    ...jest.requireActual('../../session/store'),
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

/** A connected client whose `channel.sync` answers from `answers`, and whose pushes the test emits. */
const makeClient = (): FakeClient & Record<string, unknown> => {
    const pushListeners = new Map<string, Set<(message: unknown) => void>>();
    const syncRequests: Array<{ since: number }> = [];
    const answers: unknown[] = [];
    const client = {
        syncRequests,
        answers,
        request: jest.fn(async (type: string, data: { since: number }): Promise<unknown> => {
            // The place list is read beside the delta; an empty answer leaves the cache alone.
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
    // IndexedDB work resolves through real macrotasks under fake-indexeddb.
    for (let i = 0; i < 5; i += 1) await new Promise(resolve => setTimeout(resolve, 0));
};

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
        // The IndexedDB shim lives as long as the file, so each test takes uids of its own: a fresh
        // partition per test, instead of reading the previous test's rows and cursors.
        run += 1;
        const uidOf = (cid: string): string | null => (UIDS[cid] ? `${UIDS[cid]}-${run}` : null);
        (getGlobalSessionContext as jest.Mock).mockImplementation(() => ({
            cloud: { cloudId: selected },
            identity: { userId: uidOf(selected) },
        }));
        (getUidInCloud as jest.Mock).mockImplementation(uidOf);
        data = new DataManager();
        (getDataManager as jest.Mock).mockReturnValue(data);
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
        // Becoming background with no delta yet asks at once, from zero.
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

        // B — the cloud on screen, read through the app graph — has neither the room nor the cursor,
        // and its socket was never asked.
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

        // The switch: A is selected and becomes active on the slot it already had.
        selected = 'cloud-a';
        expect(bind('cloud-a')).toBe(clientA);
        manager.setActiveSlot(A);
        clientA.emit('chat.sync', { channelId: 'ch-1', chatNo: 4 });
        // Past the debounce, with room to spare: a loop still receiving would have asked by now.
        await new Promise(resolve => setTimeout(resolve, 60));
        await flush();

        // No second delta from the loop — A is the app's now.
        expect(clientA.syncRequests).toHaveLength(1);
        expect(clientA.connect).toHaveBeenCalledTimes(0);
        // The app graph, now pointed at A, finds A's rooms and A's cursor already there: its own
        // delta starts at 500, not 0.
        const app = data.getRepositories();
        const rows = await app.channel.cacheReadList({});
        expect(rows?.list.map(row => row.id)).toEqual(['ch-1']);
        await expect(app.syncMeta.getSyncedAt('channel-sync:cloud-a')).resolves.toBe(500);

        // And B, which the user just left, is a background cloud now.
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
        // A's only — the relay is off screen too and announces its own.
        const off = subscribeBackgroundDeltas(delta => {
            if (delta.cid === 'cloud-a') deltas.push(delta);
        });
        receiver = new BackgroundReceiver(manager, { debounceMs: 20 });
        await waitFor(() => expect(deltas).toHaveLength(1));

        // A push for A reaches the app — its socket is not sent the message — and the app asks A now.
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
        // By the time it is announced, A's partition holds what the unread count is computed from.
        const rows = await data.getScopedRepositories('cloud-a').channel.cacheReadList({});
        const row = rows?.list[0] as { chatNo?: number; $join?: { chatNo?: number } } | undefined;
        expect(row?.chatNo).toBe(7);
        expect(row?.$join?.chatNo).toBe(5);
        expect(clientOf('cloud-b').syncRequests).toEqual([]);
    });
});
