import { logger } from '@chatic/logger';

import { primeChatRoom } from './primeChatRoom';

const mockUpdateLocalSnapshot = jest.fn();
jest.mock('@chatic/sync/runtime', () => ({
    getSyncManager: () => ({ updateLocalSnapshot: mockUpdateLocalSnapshot }),
}));
const mockFetchRoomFeed = jest.fn();
jest.mock('@chatic/sync/roomFeed', () => ({
    fetchRoomFeed: (...args: unknown[]) => mockFetchRoomFeed(...args),
}));
const mockCacheReadList = jest.fn();
const mockGetScopedRepositories = jest.fn((_cid: string) => ({ chat: { cacheReadList: mockCacheReadList } }));
jest.mock('../data/runtime', () => ({
    getDataManager: () => ({ getScopedRepositories: mockGetScopedRepositories }),
}));
jest.mock('@chatic/logger', () => ({
    ...jest.requireActual('@chatic/logger'),
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

beforeEach(() => {
    jest.clearAllMocks();
    mockFetchRoomFeed.mockResolvedValue(undefined);
});

describe('primeChatRoom', () => {
    it('fetches a first page into a cold room, after setting its baseline to 0', async () => {
        mockCacheReadList.mockResolvedValue({ list: [] });

        await expect(primeChatRoom('cloud-a', 'ch-1')).resolves.toBe('ready');

        expect(mockGetScopedRepositories).toHaveBeenCalledWith('cloud-a');
        expect(mockUpdateLocalSnapshot).toHaveBeenCalledWith(
            { type: 'chat', id: 'ch-1' },
            { id: 'ch-1', lastNo: 0, minNo: 0, messages: [] },
            { cid: 'cloud-a' }
        );
        expect(mockFetchRoomFeed).toHaveBeenCalledWith('cloud-a', 'ch-1', { cache: 'miss' });
    });

    it('sets a warm room baseline to its newest cached chatNo and fetches nothing', async () => {
        mockCacheReadList.mockResolvedValue({ list: [{ chatNo: 3 }, { chatNo: 9 }, { chatNo: 5 }] });

        await expect(primeChatRoom('default', 'ch-1')).resolves.toBe('ready');

        expect(mockUpdateLocalSnapshot).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ lastNo: 9 }),
            { cid: 'default' }
        );
        expect(mockFetchRoomFeed).not.toHaveBeenCalled();
    });

    it('writes nothing once its caller has stopped wanting it', async () => {
        mockCacheReadList.mockResolvedValue({ list: [] });

        await expect(primeChatRoom('default', 'ch-1', { cancelled: () => true })).resolves.toBe('cancelled');

        expect(mockUpdateLocalSnapshot).not.toHaveBeenCalled();
        expect(mockFetchRoomFeed).not.toHaveBeenCalled();
    });

    it('reports a failed read or fetch as failed, and logs it rather than throwing', async () => {
        mockCacheReadList.mockResolvedValue({ list: [] });
        mockFetchRoomFeed.mockRejectedValue(new Error('timeout'));

        await expect(primeChatRoom('default', 'ch-1')).resolves.toBe('failed');

        expect(logger.warn).toHaveBeenCalledWith(
            'SOCKET',
            '[useChatSync] Failed to prime chat target',
            expect.objectContaining({ data: { channelId: 'ch-1', cid: 'default' } })
        );
    });
});
