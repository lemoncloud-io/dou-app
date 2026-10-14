import { RELAY_CLOUD_ID } from '@chatic/data';
import type { DataRepositories } from '@chatic/data';

import { backgroundClouds, resetBackgroundClouds } from '../../socket/backgroundClouds';
import { slotKeyOf } from '../../socket/utils/slotKey';
import {
    createOutboxTransport,
    createRuntimeOutbox,
    isOutboxRefusal,
    OUTBOX_RETRY_DELAYS_MS,
    runtimeOutboxObserver,
    setStateOutboxObserver,
} from './outboxFactory';

const mockWarn = jest.fn();
jest.mock('@chatic/bridges', () => ({ logger: { warn: (...args: unknown[]) => mockWarn(...args) } }));

const mockSubscribeSlotVerified = jest.fn();
jest.mock('../../socket/runtime', () => ({
    getSocketManager: () => ({ subscribeSlotVerified: mockSubscribeSlotVerified }),
}));

const mockGetUidInCloud = jest.fn();
jest.mock('../../session/store', () => ({ getUidInCloud: (cid: string) => mockGetUidInCloud(cid) }));

jest.mock('../../session/store/stores', () => ({ cloudStore: { peekCachedCloudTokens: () => null } }));

const setVisibility = (state: 'hidden' | 'visible') => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
};

const DELIVERY = {
    op: 'join.read',
    cid: 'cloud-a',
    outcome: 'accepted',
    deliveryMs: 120.4,
    waitSocketMs: 80.6,
    attempts: 2,
} as const;

beforeEach(() => {
    setStateOutboxObserver(undefined);
    setVisibility('visible');
    mockWarn.mockReset();
    resetBackgroundClouds();
    mockSubscribeSlotVerified.mockReset();
    mockGetUidInCloud.mockReset();
});

describe('createOutboxTransport', () => {
    it("watches the named cloud's own slot, reading a missing id as the relay", () => {
        const transport = createOutboxTransport(jest.fn());
        const listener = jest.fn();

        transport.watchReady('cloud-a', listener);
        transport.watchReady('', listener);

        expect(mockSubscribeSlotVerified).toHaveBeenCalledWith(slotKeyOf('cloud-a'), listener);
        expect(mockSubscribeSlotVerified).toHaveBeenCalledWith(slotKeyOf(RELAY_CLOUD_ID), listener);
    });

    it("runs delivery in the cloud's own graph and holds its slot until it settles", async () => {
        const graph = { marker: 'cloud-a' } as unknown as DataRepositories;
        const graphOf = jest.fn(() => graph);
        const transport = createOutboxTransport(graphOf);
        let heldDuring: readonly string[] = [];

        const result = await transport.inCloud('cloud-a', async repositories => {
            heldDuring = backgroundClouds.getHeld();
            return repositories;
        });

        expect(graphOf).toHaveBeenCalledWith('cloud-a');
        expect(result).toBe(graph);
        expect(heldDuring).toEqual(['cloud-a']);
        expect(backgroundClouds.getHeld()).toEqual([]);
    });

    it('releases the slot when delivery fails', async () => {
        const transport = createOutboxTransport(() => ({}) as DataRepositories);

        await expect(
            transport.inCloud('cloud-a', async () => {
                throw new Error('503 SOCKET NOT CONNECTED');
            })
        ).rejects.toThrow('503');

        expect(backgroundClouds.getHeld()).toEqual([]);
    });

    it("reads the account's uid in the named cloud, null when there is none", () => {
        const transport = createOutboxTransport(jest.fn());
        mockGetUidInCloud.mockImplementation((cid: string) => (cid === 'cloud-a' ? 'u-a' : undefined));

        expect(transport.uidOf('cloud-a')).toBe('u-a');
        expect(transport.uidOf('cloud-b')).toBeNull();
    });

    it('retries on the shared bounded schedule', () => {
        expect(createOutboxTransport(jest.fn()).retryDelaysMs).toBe(OUTBOX_RETRY_DELAYS_MS);
        expect(OUTBOX_RETRY_DELAYS_MS).toEqual([2_000, 5_000, 15_000]);
    });
});

describe('isOutboxRefusal', () => {
    it.each([
        ['403 FORBIDDEN - not a member', true],
        ['404 NOT FOUND', true],
        ['408 REQUEST TIMEOUT', false],
        ['429 TOO MANY REQUESTS', false],
        ['499 CLIENT CLOSED REQUEST', false],
        ['503 SOCKET NOT CONNECTED', false],
        ['500 INTERNAL', false],
        ['no status at all', false],
    ])('%s → %s', (message, refused) => {
        expect(isOutboxRefusal(new Error(message))).toBe(refused);
    });
});

// What a real server refusal looks like once the socket layer has recovered its code: the message is
// the server's own text with no status in front, and the status rides on `errorCode`.
it('reads a server refusal by the errorCode it carries, not only by a status prefix', () => {
    const refusal = Object.assign(new Error('@chatNo[999] is invalid - overflow[5] - chat.read:error'), {
        errorCode: 400,
    });
    const serverFailure = Object.assign(new Error('internal - chat.read:error'), { errorCode: 500 });

    expect(isOutboxRefusal(refusal)).toBe(true);
    expect(isOutboxRefusal(serverFailure)).toBe(false);
});

describe('createRuntimeOutbox', () => {
    it('sends a read through the cloud it names once that slot is verified', async () => {
        const sendRead = jest.fn().mockResolvedValue({ id: 'ch-1@u-a', chatNo: 9 });
        const cacheWrite = jest.fn().mockResolvedValue(undefined);
        const graph = { join: { sendRead, cacheWrite } } as unknown as DataRepositories;
        const graphOf = jest.fn(() => graph);
        mockGetUidInCloud.mockReturnValue('u-a');
        mockSubscribeSlotVerified.mockImplementation((_key, listener: (verified: boolean) => void) => {
            listener(true);
            return () => undefined;
        });
        const outbox = createRuntimeOutbox(graphOf);

        await outbox.set({ op: 'join.read', cid: 'cloud-a', uid: 'u-a', key: 'ch-1', value: 9 }).delivered;

        expect(graphOf).toHaveBeenCalledWith('cloud-a');
        expect(sendRead).toHaveBeenCalledWith({ channelId: 'ch-1', chatNo: 9 });
        expect(cacheWrite).toHaveBeenCalledWith({ id: 'ch-1@u-a', chatNo: 9 });
    });
});

describe('runtimeOutboxObserver', () => {
    it('follows no wait while nobody observes', () => {
        expect(runtimeOutboxObserver.begin()).toBeUndefined();
    });

    it('hands over a settled write with its socket kind and whole milliseconds', () => {
        const observer = jest.fn();
        setStateOutboxObserver(observer);

        runtimeOutboxObserver.begin()?.(DELIVERY);
        runtimeOutboxObserver.begin()?.({ ...DELIVERY, cid: '', outcome: 'refused' });
        runtimeOutboxObserver.begin()?.({ ...DELIVERY, cid: RELAY_CLOUD_ID, outcome: 'account_changed' });

        expect(observer.mock.calls.map(([sample]) => sample)).toEqual([
            { op: 'join.read', kind: 'cloud', outcome: 'accepted', deliveryMs: 120, waitSocketMs: 81, attempts: 2 },
            { op: 'join.read', kind: 'relay', outcome: 'refused', deliveryMs: 120, waitSocketMs: 81, attempts: 2 },
            {
                op: 'join.read',
                kind: 'relay',
                outcome: 'account_changed',
                deliveryMs: 120,
                waitSocketMs: 81,
                attempts: 2,
            },
        ]);
    });

    it('drops a wait whose observer was replaced or removed before it settled', () => {
        const first = jest.fn();
        const second = jest.fn();
        setStateOutboxObserver(first);
        const replaced = runtimeOutboxObserver.begin();
        const removed = runtimeOutboxObserver.begin();
        setStateOutboxObserver(second);

        replaced?.(DELIVERY);
        setStateOutboxObserver(undefined);
        removed?.(DELIVERY);

        expect(first).not.toHaveBeenCalled();
        expect(second).not.toHaveBeenCalled();
    });

    it('follows no wait that begins on a hidden page', () => {
        setStateOutboxObserver(jest.fn());
        setVisibility('hidden');

        expect(runtimeOutboxObserver.begin()).toBeUndefined();
    });

    it('drops a wait the page was hidden during', () => {
        const observer = jest.fn();
        setStateOutboxObserver(observer);
        const settle = runtimeOutboxObserver.begin();

        setVisibility('hidden');
        setVisibility('visible');
        settle?.(DELIVERY);

        expect(observer).not.toHaveBeenCalled();
    });

    it('logs an observer that throws instead of passing it on', () => {
        setStateOutboxObserver(() => {
            throw new Error('observer broke');
        });

        expect(() => runtimeOutboxObserver.begin()?.(DELIVERY)).not.toThrow();
        expect(mockWarn).toHaveBeenCalledWith('PERF', expect.stringContaining('observer threw'), expect.anything());
    });

    it('is the observer the runtime outbox reports through', async () => {
        const observer = jest.fn();
        setStateOutboxObserver(observer);
        const graph = {
            join: { sendRead: jest.fn().mockResolvedValue({ id: 'ch-1@u-a' }), cacheWrite: jest.fn() },
        } as unknown as DataRepositories;
        mockGetUidInCloud.mockReturnValue('u-a');
        mockSubscribeSlotVerified.mockImplementation((_key, listener: (verified: boolean) => void) => {
            listener(true);
            return () => undefined;
        });

        await createRuntimeOutbox(() => graph).set({
            op: 'join.read',
            cid: 'cloud-a',
            uid: 'u-a',
            key: 'ch-1',
            value: 9,
        }).delivered;

        expect(observer).toHaveBeenCalledWith(
            expect.objectContaining({ op: 'join.read', kind: 'cloud', outcome: 'accepted', attempts: 1 })
        );
    });
});
