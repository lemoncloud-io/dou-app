import { renderHook } from '@testing-library/react';
import { useUserLocalDataSource } from './useUserLocalDataSource';
import { createStorageAdapter } from '../../data/local/storages';

jest.mock('../../data/local/storages', () => ({
    createStorageAdapter: jest.fn(),
}));

describe('useUserRepository', () => {
    const mockCloudId = 'test-cloud';

    const mockUserDB = { load: jest.fn(), save: jest.fn() };
    const mockJoinDB = { loadAll: jest.fn(), save: jest.fn() };
    const mockChannelDB = { load: jest.fn() };

    beforeEach(() => {
        jest.clearAllMocks();
        (createStorageAdapter as jest.Mock).mockImplementation(type => {
            if (type === 'user') return mockUserDB;
            if (type === 'join') return mockJoinDB;
            if (type === 'channel') return mockChannelDB;
            return null;
        });
    });

    it('saveUser: $join 정보가 있으면 userDB와 joinDB 양쪽에 저장한다', async () => {
        const { result } = renderHook(() => useUserLocalDataSource(mockCloudId));
        const mockUser = { id: 'u1', name: 'Alice', $join: { id: 'join1' } } as any;

        await result.current.saveUser(mockUser);

        expect(mockUserDB.save).toHaveBeenCalledWith('u1', mockUser);
        expect(mockJoinDB.save).toHaveBeenCalledWith('join1', mockUser.$join);
    });

    it('getUsersByChannel: 채널 정보를 읽고, 멤버를 불러온 뒤 $join 데이터를 매핑하여 반환한다', async () => {
        // 1. 채널 데이터 모킹 (멤버가 u1, u2)
        mockChannelDB.load.mockResolvedValue({ id: 'ch1', memberIds: ['u1', 'u2'] });

        // 2. 유저 데이터 모킹
        mockUserDB.load.mockImplementation(id => Promise.resolve({ id, name: `User_${id}` }));

        // 3. 조인 데이터 모킹 (u1의 조인 정보만 존재)
        const joinData = [
            { id: 'j1', channelId: 'ch1', userId: 'u1' },
            { id: 'j2', channelId: 'ch2', userId: 'u3' }, // 이 채널의 조인이 아님
        ];
        mockJoinDB.loadAll.mockResolvedValue(joinData);

        const { result } = renderHook(() => useUserLocalDataSource(mockCloudId));
        const users = await result.current.getUsersByChannel('ch1');

        expect(users).toHaveLength(2);

        // u1은 $join이 매핑되어야 함
        expect(users[0]).toEqual({ id: 'u1', name: 'User_u1', $join: joinData[0] });

        // u2는 $join이 없으므로 undefined로 세팅되어야 함
        expect(users[1]).toEqual({ id: 'u2', name: 'User_u2', $join: undefined });
    });
});
