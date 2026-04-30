import { renderHook } from '@testing-library/react';
import { useJoinLocalDataSource } from './useJoinLocalDataSource';
import { createStorageAdapter } from '../../data/local/storages';

jest.mock('../../data/local/storages', () => ({
    createStorageAdapter: jest.fn(),
}));

describe('useJoinRepository', () => {
    const mockCloudId = 'test-cloud';
    const mockJoinDB = { loadAll: jest.fn(), save: jest.fn(), load: jest.fn(), delete: jest.fn() };

    beforeEach(() => {
        jest.clearAllMocks();
        (createStorageAdapter as jest.Mock).mockReturnValue(mockJoinDB);
    });

    it('getActiveJoinsByChannel: 나간 사람(joined: 0)을 제외하고 필터링한다', async () => {
        mockJoinDB.loadAll.mockResolvedValue([
            { id: 'j1', channelId: 'ch1', joined: 1 }, // 참여 중
            { id: 'j2', channelId: 'ch1', joined: 0 }, // 나감
            { id: 'j3', channelId: 'ch1', joined: undefined }, // 기본값 (참여 중)
            { id: 'j4', channelId: 'ch2', joined: 1 }, // 다른 채널
        ]);
        const { result } = renderHook(() => useJoinLocalDataSource(mockCloudId));
        const activeJoins = await result.current.getActiveJoinsByChannel('ch1');

        expect(activeJoins).toHaveLength(2);
        expect(activeJoins.map(j => j.id)).toEqual(['j1', 'j3']);
    });

    it('saveJoins: 배열 내의 모든 항목을 병렬로 저장한다', async () => {
        const { result } = renderHook(() => useJoinLocalDataSource(mockCloudId));
        const mockJoins = [{ id: 'j1' }, { id: 'j2' }] as any[];

        await result.current.saveJoins(mockJoins);

        expect(mockJoinDB.save).toHaveBeenCalledTimes(2);
        expect(mockJoinDB.save).toHaveBeenCalledWith('j1', mockJoins[0]);
        expect(mockJoinDB.save).toHaveBeenCalledWith('j2', mockJoins[1]);
    });
});
