import { renderHook, waitFor, act } from '@testing-library/react';
import { useChannel } from './useChannel';
import { useWebSocketV2 } from '@chatic/socket';
import { useDynamicProfile } from '@chatic/web-core';
import { useChannelLocalDataSource, useJoinLocalDataSource } from '../local/data-sources'; // useJoinRepository 추가
import { APP_SYNC_EVENT_NAME } from '../sync-events';

// 의존성 모킹
jest.mock('@chatic/socket', () => ({
    useWebSocketV2: jest.fn(),
}));

jest.mock('@chatic/web-core', () => ({
    useDynamicProfile: jest.fn(),
}));

jest.mock('../local/data-sources', () => ({
    useChannelRepository: jest.fn(),
    useJoinRepository: jest.fn(), // 추가
}));

describe('useChannel Hook', () => {
    const mockCloudId = 'test-cloud-id';
    const mockUid = 'user-123';
    const mockGetChannel = jest.fn();
    const mockGetJoins = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (useWebSocketV2 as jest.Mock).mockReturnValue({ cloudId: mockCloudId });
        (useDynamicProfile as jest.Mock).mockReturnValue({ uid: mockUid });
        (useChannelLocalDataSource as jest.Mock).mockReturnValue({
            cloudId: mockCloudId,
            getChannel: mockGetChannel,
        });
        (useJoinLocalDataSource as jest.Mock).mockReturnValue({
            getJoinsByChannel: mockGetJoins,
        });
    });

    it('channelId가 null일 경우 로딩을 종료하고 channel을 null로 반환해야 한다', async () => {
        const { result } = renderHook(() => useChannel(null));

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.channel).toBeNull();
        expect(result.current.isError).toBe(false);
    });

    it('데이터를 가져와 ClientChannelView로 정확히 매핑하고 unreadCount를 계산해야 한다', async () => {
        const mockChannelId = 'channel-1';

        // 1. DB 채널 데이터 모킹
        mockGetChannel.mockResolvedValue({
            id: mockChannelId,
            ownerId: mockUid,
            stereo: 'self',
            memberNo: 1,
            lastChat$: { chatNo: 10 }, // 마지막 메시지 번호 10
        });

        // 2. 참여 정보 모킹 (내 읽음 위치 7)
        mockGetJoins.mockResolvedValue([{ userId: mockUid, chatNo: 7 }]);

        const { result } = renderHook(() => useChannel(mockChannelId));

        expect(result.current.isLoading).toBe(true);

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        // 매핑 결과 검증
        expect(result.current.channel).toEqual(
            expect.objectContaining({
                id: mockChannelId,
                isOwner: true,
                isSelfChat: true,
                memberCount: 1,
                unreadCount: 3, // 10 - 7 = 3
            })
        );
    });

    it('DB 조회 중 에러가 발생하면 isError가 true가 되어야 한다', async () => {
        const mockChannelId = 'channel-error';
        mockGetChannel.mockRejectedValue(new Error('DB Error'));

        const { result } = renderHook(() => useChannel(mockChannelId));

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.isError).toBe(true);
        expect(result.current.channel).toBeNull();
    });

    it('전역 이벤트(APP_SYNC_EVENT_NAME) 발생 시 데이터를 다시 가져와야 한다', async () => {
        const mockChannelId = 'channel-sync';
        mockGetChannel.mockResolvedValue({ id: mockChannelId, ownerId: 'other' });
        mockGetJoins.mockResolvedValue([]);

        renderHook(() => useChannel(mockChannelId));

        await waitFor(() => {
            expect(mockGetChannel).toHaveBeenCalledTimes(1);
        });

        // 이벤트 발생 시뮬레이션
        act(() => {
            window.dispatchEvent(
                new CustomEvent(APP_SYNC_EVENT_NAME, {
                    detail: {
                        domain: 'chat', // 채널 뿐만 아니라 채팅 이벤트 시에도 갱신 확인
                        targetId: mockChannelId,
                        cid: mockCloudId,
                    },
                })
            );
        });

        await waitFor(() => {
            expect(mockGetChannel).toHaveBeenCalledTimes(2);
        });
    });

    it('refresh 함수를 호출하면 데이터를 수동으로 다시 가져와야 한다', async () => {
        const mockChannelId = 'channel-refresh';
        mockGetChannel.mockResolvedValue({ id: mockChannelId });
        mockGetJoins.mockResolvedValue([]);

        const { result } = renderHook(() => useChannel(mockChannelId));

        await waitFor(() => {
            expect(mockGetChannel).toHaveBeenCalledTimes(1);
        });

        act(() => {
            result.current.refresh();
        });

        await waitFor(() => {
            expect(mockGetChannel).toHaveBeenCalledTimes(2);
        });
    });
});
