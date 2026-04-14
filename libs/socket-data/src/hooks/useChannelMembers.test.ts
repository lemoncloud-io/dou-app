import { renderHook, waitFor } from '@testing-library/react';
import { useWebSocketV2 } from '@chatic/socket';
import { useUserRepository } from '../repository';
import { useChannelMembers } from './useChannelMembers';

jest.mock('@chatic/socket', () => ({ useWebSocketV2: jest.fn() }));
jest.mock('../repository', () => ({ useUserRepository: jest.fn() }));
jest.mock('@chatic/web-core', () => ({
    useDynamicProfile: jest.fn(() => ({ uid: 'test-user' })),
    cloudCore: {
        getConfig: jest.fn(),
    },
}));

describe('useChannelMembers', () => {
    const mockEmitAuthenticated = jest.fn();
    const mockGetUsersByChannel = jest.fn();

    const mockCloudId = 'test-cloud';
    const mockChannelId = 'ch1';

    const mockUserRepoInstance = {
        cloudId: mockCloudId,
        getUsersByChannel: mockGetUsersByChannel,
    };

    beforeEach(() => {
        jest.clearAllMocks();

        (useWebSocketV2 as jest.Mock).mockReturnValue({
            emitAuthenticated: mockEmitAuthenticated,
            cloudId: mockCloudId,
        });

        (useUserRepository as jest.Mock).mockReturnValue(mockUserRepoInstance);
    });

    it('마운트 시 로컬 DB 조회 및 네트워크(users) 동기화 요청을 수행하고 상태를 업데이트한다', async () => {
        const mockUsers = [
            { id: 'user1', name: 'Dou' },
            { id: 'user2', name: 'Chatic' },
        ];
        mockGetUsersByChannel.mockResolvedValue(mockUsers);

        const { result } = renderHook(() => useChannelMembers({ channelId: mockChannelId }));

        // 초기 상태 검증
        expect(result.current.isLoading).toBe(true);
        expect(result.current.isSyncing).toBe(true);

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        // DB 조회 및 상태 반영 검증
        expect(mockGetUsersByChannel).toHaveBeenCalledWith(mockChannelId);
        expect(result.current.members).toEqual(mockUsers);
        expect(result.current.total).toBe(2);
        expect(result.current.isError).toBe(false);

        // 소켓 동기화 요청 검증
        expect(mockEmitAuthenticated).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'chat',
                action: 'users',
                payload: { channelId: mockChannelId },
            })
        );
    });

    it('로컬 DB 조회 중 에러 발생 시 isError 상태가 true로 변경된다', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        mockGetUsersByChannel.mockRejectedValue(new Error('DB Error'));

        const { result } = renderHook(() => useChannelMembers({ channelId: mockChannelId }));

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.isError).toBe(true);
        expect(result.current.members).toEqual([]);
        expect(result.current.total).toBe(0);

        consoleSpy.mockRestore();
    });
});
