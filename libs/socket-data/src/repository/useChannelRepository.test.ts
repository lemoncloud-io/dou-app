import { renderHook } from '@testing-library/react';
import { useChannelRepository } from './useChannelRepository';
import { createStorageAdapter } from '../storages';

jest.mock('../storages', () => ({
    createStorageAdapter: jest.fn(),
}));

describe('useChannelRepository', () => {
    const mockCloudId = 'test-cloud-123';

    const mockChannelDB = {
        loadAll: jest.fn(),
        load: jest.fn(),
        save: jest.fn(),
        delete: jest.fn(),
    };

    const mockJoinDB = {
        loadAll: jest.fn(),
        load: jest.fn(),
        save: jest.fn(),
        delete: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();

        (createStorageAdapter as jest.Mock).mockImplementation((type: string) => {
            if (type === 'channel') return mockChannelDB;
            if (type === 'join') return mockJoinDB;
            return null;
        });
    });

    it('cloudId가 없으면 DB 어댑터를 생성하지 않는다', () => {
        renderHook(() => useChannelRepository(''));
        expect(createStorageAdapter).not.toHaveBeenCalled();
    });

    it('getChannels: 모든 채널 목록을 반환한다', async () => {
        const mockData = [{ id: 'ch1' }, { id: 'ch2' }];
        mockChannelDB.loadAll.mockResolvedValue(mockData);

        const { result } = renderHook(() => useChannelRepository(mockCloudId));
        const channels = await result.current.getChannels();

        expect(mockChannelDB.loadAll).toHaveBeenCalledTimes(1);
        expect(channels).toEqual(mockData);
    });

    it('getChannelsByPlace: 특정 placeId(sid)에 속한 채널만 필터링하여 반환한다', async () => {
        const mockData = [
            { id: 'ch1', sid: 'place-A' },
            { id: 'ch2', sid: 'place-B' },
            { id: 'ch3', sid: 'place-A' },
        ];
        mockChannelDB.loadAll.mockResolvedValue(mockData);

        const { result } = renderHook(() => useChannelRepository(mockCloudId));
        const channels = await result.current.getChannelsByPlace('place-A');

        expect(channels).toHaveLength(2);
        expect(channels.map(ch => ch.id)).toEqual(['ch1', 'ch3']);
    });

    it('getChannel: 특정 ID의 채널을 반환한다', async () => {
        const mockData = { id: 'ch1', sid: 'place-A' };
        mockChannelDB.load.mockResolvedValue(mockData);

        const { result } = renderHook(() => useChannelRepository(mockCloudId));
        const channel = await result.current.getChannel('ch1');

        expect(mockChannelDB.load).toHaveBeenCalledWith('ch1');
        expect(channel).toEqual(mockData);
    });

    describe('saveChannel', () => {
        it('$join 정보가 없을 경우 channelDB에만 저장한다', async () => {
            const { result } = renderHook(() => useChannelRepository(mockCloudId));
            const mockChannel = { id: 'ch1', sid: 'place-A' } as any;

            await result.current.saveChannel('ch1', mockChannel);

            expect(mockChannelDB.save).toHaveBeenCalledWith('ch1', mockChannel);
            expect(mockJoinDB.save).not.toHaveBeenCalled();
        });

        it('$join 정보가 있을 경우 channelDB와 joinDB 모두에 저장한다', async () => {
            const { result } = renderHook(() => useChannelRepository(mockCloudId));
            const mockJoin = { id: 'join1' };
            const mockChannel = { id: 'ch1', sid: 'place-A', $join: mockJoin } as any;

            await result.current.saveChannel('ch1', mockChannel);

            expect(mockChannelDB.save).toHaveBeenCalledWith('ch1', mockChannel);
            expect(mockJoinDB.save).toHaveBeenCalledWith('join1', mockJoin);
        });
    });

    describe('deleteChannel', () => {
        it('채널에 연관된 $join 정보가 없으면 channelDB에서만 삭제한다', async () => {
            const { result } = renderHook(() => useChannelRepository(mockCloudId));
            mockChannelDB.load.mockResolvedValue({ id: 'ch1' });

            await result.current.deleteChannel('ch1');

            expect(mockChannelDB.load).toHaveBeenCalledWith('ch1'); // 삭제 전 조회를 확인
            expect(mockChannelDB.delete).toHaveBeenCalledWith('ch1');
            expect(mockJoinDB.delete).not.toHaveBeenCalled();
        });

        it('채널에 연관된 $join 정보가 있으면 channelDB와 joinDB에서 모두 삭제한다', async () => {
            const { result } = renderHook(() => useChannelRepository(mockCloudId));
            mockChannelDB.load.mockResolvedValue({ id: 'ch1', $join: { id: 'join1' } });

            await result.current.deleteChannel('ch1');

            expect(mockChannelDB.delete).toHaveBeenCalledWith('ch1');
            expect(mockJoinDB.delete).toHaveBeenCalledWith('join1');
        });
    });
});
