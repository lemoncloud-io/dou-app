import { renderHook, waitFor } from '@testing-library/react';
import { useWebSocketV2 } from '@chatic/socket';
import { useChatRepository, useJoinRepository } from '../repository';
import { useChats } from '../hooks';

jest.mock('@chatic/socket', () => ({
    useWebSocketV2: jest.fn(),
}));

jest.mock('@chatic/web-core', () => ({
    useDynamicProfile: jest.fn(() => ({ uid: 'test-user' })),
    cloudCore: {
        getConfig: jest.fn(),
    },
}));

jest.mock('../repository', () => ({
    useChatRepository: jest.fn(),
    useJoinRepository: jest.fn(),
}));

describe('useChats', () => {
    const mockEmitAuthenticated = jest.fn();
    const mockGetChatsByChannel = jest.fn();
    const mockGetActiveJoinsByChannel = jest.fn();

    const mockChatRepoInstance = {
        cloudId: 'test-cloud',
        getChatsByChannel: mockGetChatsByChannel,
    };
    const mockJoinRepoInstance = {
        getActiveJoinsByChannel: mockGetActiveJoinsByChannel,
    };

    beforeEach(() => {
        jest.clearAllMocks();

        (useWebSocketV2 as jest.Mock).mockReturnValue({
            emitAuthenticated: mockEmitAuthenticated,
            cloudId: 'test-cloud',
        });

        (useChatRepository as jest.Mock).mockReturnValue(mockChatRepoInstance);
        (useJoinRepository as jest.Mock).mockReturnValue(mockJoinRepoInstance);
    });

    it('마운트 시 로컬 DB 조회 및 네트워크(feed) 동기화 요청을 수행한다', async () => {
        mockGetChatsByChannel.mockResolvedValue([]);
        mockGetActiveJoinsByChannel.mockResolvedValue([]);

        const { result } = renderHook(() => useChats({ channelId: 'ch1' }));

        expect(result.current.isLoading).toBe(true);
        expect(result.current.isSyncing).toBe(true);

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(mockGetChatsByChannel).toHaveBeenCalledWith('ch1');
        expect(mockEmitAuthenticated).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'feed', type: 'chat', payload: { channelId: 'ch1' } })
        );
    });

    it('활성 참여자 수와 각 메시지의 chatNo를 비교하여 unreadCount를 정확히 계산한다', async () => {
        // 참여자 3명 (user1: 100번까지 읽음, user2: 90번, user3: 80번)
        mockGetActiveJoinsByChannel.mockResolvedValue([
            { id: 'j1', chatNo: 100 },
            { id: 'j2', chatNo: 90 },
            { id: 'j3', chatNo: 80 },
        ]);

        mockGetChatsByChannel.mockResolvedValue([
            { id: 'm1', chatNo: 85 }, // user1, user2가 읽음 -> 3명 중 2명 읽음 -> unread: 1
            { id: 'm2', chatNo: 95 }, // user1만 읽음 -> 3명 중 1명 읽음 -> unread: 2
            { id: 'm3', chatNo: undefined }, // 서버 발급 전(pending) -> 본인 제외 모두 안 읽음 -> unread: 2
        ]);

        const { result } = renderHook(() => useChats({ channelId: 'ch1' }));

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.messages[0].unreadCount).toBe(1);
        expect(result.current.messages[1].unreadCount).toBe(2);
        expect(result.current.messages[2].unreadCount).toBe(2);
    });
});
