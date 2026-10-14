import { RELAY_CLOUD_ID } from '@chatic/data';
import type { DataRepositories } from '@chatic/data';

import { backgroundClouds, resetBackgroundClouds } from '../../socket/backgroundClouds';
import { slotKeyOf } from '../../socket/utils/slotKey';
import { createOutboxTransport, createRuntimeOutbox, isOutboxRefusal, OUTBOX_RETRY_DELAYS_MS } from './outboxFactory';

const mockSubscribeSlotVerified = jest.fn();
jest.mock('../../socket/runtime', () => ({
    getSocketManager: () => ({ subscribeSlotVerified: mockSubscribeSlotVerified }),
}));

const mockGetUidInCloud = jest.fn();
jest.mock('../../session/store', () => ({ getUidInCloud: (cid: string) => mockGetUidInCloud(cid) }));

jest.mock('../../session/store/stores', () => ({ cloudStore: { peekCachedCloudTokens: () => null } }));

beforeEach(() => {
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
