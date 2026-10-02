import { RELAY_CLOUD_ID } from '@chatic/data';

import { backgroundClouds, resetBackgroundClouds } from '../socket/backgroundClouds';
import { slotKeyOf } from '../socket/utils/slotKey';
import {
    CLOUD_SOCKET_WAIT_MS,
    getCloudRepositories,
    runInCloud,
    sendChatInCloud,
    waitForCloudSocket,
} from './cloudChat';

const mockGetScopedRepositories = jest.fn();
jest.mock('./runtime', () => ({
    getDataManager: () => ({ getScopedRepositories: mockGetScopedRepositories }),
}));

const mockWaitUntilSlotVerified = jest.fn();
jest.mock('../socket/runtime', () => ({
    getSocketManager: () => ({ waitUntilSlotVerified: mockWaitUntilSlotVerified }),
}));

jest.mock('../session/store/stores', () => ({ cloudStore: { peekCachedCloudTokens: () => null } }));

const payload = { channelId: 'ch-1', content: 'hello' };

/** A scoped graph whose sendChat is controlled by the test, recording the holds at the moment it runs. */
const graphWith = (sendChat: jest.Mock) => ({ chat: { sendChat } });

beforeEach(() => {
    resetBackgroundClouds();
    mockGetScopedRepositories.mockReset();
});

describe('getCloudRepositories', () => {
    it('hands out the graph scoped to the named cloud', () => {
        const graph = graphWith(jest.fn());
        mockGetScopedRepositories.mockReturnValue(graph);

        expect(getCloudRepositories('cloud-a')).toBe(graph);
        expect(mockGetScopedRepositories).toHaveBeenCalledWith('cloud-a');
    });

    it('reads a missing cloud id as the relay', () => {
        getCloudRepositories('');

        expect(mockGetScopedRepositories).toHaveBeenCalledWith('default');
    });
});

describe('sendChatInCloud', () => {
    it("sends through the cloud's own graph and holds its slot until the ack", async () => {
        let resolveAck: (chat: unknown) => void = () => undefined;
        const sendChat = jest.fn(() => new Promise(resolve => (resolveAck = resolve)));
        mockGetScopedRepositories.mockReturnValue(graphWith(sendChat));

        const pending = sendChatInCloud('cloud-a', payload);

        expect(mockGetScopedRepositories).toHaveBeenCalledWith('cloud-a');
        expect(sendChat).toHaveBeenCalledWith(payload);
        expect(backgroundClouds.getHeld()).toEqual(['cloud-a']);

        resolveAck({ id: 'ch-1:7' });
        await expect(pending).resolves.toEqual({ id: 'ch-1:7' });
        expect(backgroundClouds.getHeld()).toEqual([]);
    });

    it('takes the hold before the graph is even asked for, so no switch can slip in first', () => {
        mockGetScopedRepositories.mockImplementation(() => {
            expect(backgroundClouds.getHeld()).toEqual(['cloud-a']);
            return graphWith(jest.fn().mockResolvedValue({}));
        });

        return sendChatInCloud('cloud-a', payload);
    });

    it('releases the hold when the send fails, and rethrows', async () => {
        const failure = new Error('499');
        mockGetScopedRepositories.mockReturnValue(graphWith(jest.fn().mockRejectedValue(failure)));

        await expect(sendChatInCloud('cloud-a', payload)).rejects.toBe(failure);
        expect(backgroundClouds.getHeld()).toEqual([]);
    });

    it('releases the hold when the slot is not bound and the send throws at once', async () => {
        mockGetScopedRepositories.mockReturnValue(
            graphWith(
                jest.fn(() => {
                    throw new Error('[SocketManager] no cloud slot bound');
                })
            )
        );

        await expect(sendChatInCloud('cloud-a', payload)).rejects.toThrow('no cloud slot bound');
        expect(backgroundClouds.getHeld()).toEqual([]);
    });

    it('keeps the slot held while a second send to the same cloud is still in flight', async () => {
        let resolveSecond: (chat: unknown) => void = () => undefined;
        const sendChat = jest
            .fn()
            .mockResolvedValueOnce({ id: 'first' })
            .mockImplementationOnce(() => new Promise(resolve => (resolveSecond = resolve)));
        mockGetScopedRepositories.mockReturnValue(graphWith(sendChat));

        const first = sendChatInCloud('cloud-a', payload);
        const second = sendChatInCloud('cloud-a', payload);
        await first;

        expect(backgroundClouds.getHeld()).toEqual(['cloud-a']);
        resolveSecond({ id: 'second' });
        await second;
        expect(backgroundClouds.getHeld()).toEqual([]);
    });
});

describe('runInCloud', () => {
    it("runs the work against the cloud's graph and holds its slot for the whole of it", async () => {
        const graph = graphWith(jest.fn());
        mockGetScopedRepositories.mockReturnValue(graph);
        const heldDuring: Array<readonly string[]> = [];
        let finishUpload: () => void = () => undefined;

        const done = runInCloud('cloud-a', async repositories => {
            heldDuring.push(backgroundClouds.getHeld());
            await new Promise<void>(resolve => (finishUpload = resolve));
            heldDuring.push(backgroundClouds.getHeld());
            return repositories;
        });
        finishUpload();

        await expect(done).resolves.toBe(graph);
        expect(heldDuring).toEqual([['cloud-a'], ['cloud-a']]);
        expect(backgroundClouds.getHeld()).toEqual([]);
    });

    it('releases the hold when the work throws', async () => {
        mockGetScopedRepositories.mockReturnValue(graphWith(jest.fn()));

        await expect(
            runInCloud('cloud-a', async () => {
                throw new Error('upload failed');
            })
        ).rejects.toThrow('upload failed');
        expect(backgroundClouds.getHeld()).toEqual([]);
    });
});

describe('waitForCloudSocket', () => {
    it("waits on the named cloud's own slot, ten seconds unless told otherwise", async () => {
        mockWaitUntilSlotVerified.mockResolvedValue(true);

        await expect(waitForCloudSocket('cloud-a')).resolves.toBe(true);

        expect(mockWaitUntilSlotVerified).toHaveBeenCalledWith(slotKeyOf('cloud-a'), CLOUD_SOCKET_WAIT_MS);
        expect(CLOUD_SOCKET_WAIT_MS).toBe(10_000);
    });

    it('reads a missing cloud id as the relay, and passes on a socket that did not come back', async () => {
        mockWaitUntilSlotVerified.mockResolvedValue(false);

        await expect(waitForCloudSocket('', 50)).resolves.toBe(false);

        expect(mockWaitUntilSlotVerified).toHaveBeenCalledWith(slotKeyOf(RELAY_CLOUD_ID), 50);
    });
});
