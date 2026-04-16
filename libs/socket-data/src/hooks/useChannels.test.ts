// libs/socket-data/src/hooks/useChannels.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWebSocketV2 } from '@chatic/socket';
import { useDynamicProfile } from '@chatic/web-core';
import { useChannelRepository, useJoinRepository } from '../repository';
import { APP_SYNC_EVENT_NAME } from '../sync-events';
import { useChannels } from './useChannels';

// 의존성 모킹
jest.mock('@chatic/web-core', () => ({
    useDynamicProfile: jest.fn(),
    cloudCore: { getConfig: jest.fn() },
}));

jest.mock('@chatic/socket', () => ({
    useWebSocketV2: jest.fn(),
}));

jest.mock('../repository', () => ({
    useChannelRepository: jest.fn(),
    useJoinRepository: jest.fn(), // 추가된 Repository 모킹
}));

describe('useChannels', () => {
    const mockEmitAuthenticated = jest.fn();
    const mockGetChannelsByPlace = jest.fn();
    const mockGetJoinsByChannel = jest.fn();
    const mockCloudId = 'test-cloud';
    const mockPlaceId = 'place-1';
    const mockUid = 'test-user';

    beforeEach(() => {
        jest.clearAllMocks();

        // WebSocket 및 프로필 모킹
        (useWebSocketV2 as jest.Mock).mockReturnValue({
            emitAuthenticated: mockEmitAuthenticated,
            cloudId: mockCloudId,
        });
        (useDynamicProfile as jest.Mock).mockReturnValue({ uid: mockUid });

        // 리포지토리 모킹
        (useChannelRepository as jest.Mock).mockReturnValue({
            cloudId: mockCloudId,
            getChannelsByPlace: mockGetChannelsByPlace,
        });
        (useJoinRepository as jest.Mock).mockReturnValue({
            getJoinsByChannel: mockGetJoinsByChannel,
        });
    });

    it('마운트 시 DB 조회, 네트워크 동기화, unreadCount 계산을 수행한다', async () => {
        // 1. 채널 데이터 모킹 (업데이트 순서: ch2 > ch3 > ch1)
        const mockChannels = [
            { id: 'ch1', updatedAt: 1000, lastChat$: { chatNo: 5 }, ownerId: 'other' },
            { id: 'ch2', updatedAt: 3000, lastChat$: { chatNo: 10 }, ownerId: mockUid }, // 내 채널
            { id: 'ch3', updatedAt: 2000, lastChat$: { chatNo: 8 }, ownerId: 'other' },
        ];
        mockGetChannelsByPlace.mockResolvedValue(mockChannels);

        // 2. 참여 정보 모킹 (내 읽음 위치)
        // ch2는 10번까지 다 읽음 (unread: 0), ch3는 5번까지 읽음 (unread: 3)
        mockGetJoinsByChannel.mockImplementation((channelId: string) => {
            if (channelId === 'ch2') return Promise.resolve([{ userId: mockUid, chatNo: 10 }]);
            if (channelId === 'ch3') return Promise.resolve([{ userId: mockUid, chatNo: 5 }]);
            return Promise.resolve([]);
        });

        const { result } = renderHook(() => useChannels({ placeId: mockPlaceId }));

        // 초기 상태 확인
        expect(result.current.isLoading).toBe(true);
        expect(result.current.isSyncing).toBe(true);

        // 비동기 로딩 완료 대기
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        // 소켓 호출 검증
        expect(mockEmitAuthenticated).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'chat', action: 'mine', payload: { placeId: mockPlaceId } })
        );

        // 정렬 검증 (최신순: ch2 -> ch3 -> ch1)
        expect(result.current.channels[0].id).toBe('ch2');
        expect(result.current.channels[1].id).toBe('ch3');

        // 매핑 및 unreadCount 검증
        expect(result.current.channels[0].unreadCount).toBe(0); // 10 - 10
        expect(result.current.channels[1].unreadCount).toBe(3); // 8 - 5
        expect(result.current.channels[0].isOwner).toBe(true);
    });

    it('limit과 page 파라미터를 적용하여 페이지네이션 처리한다', async () => {
        const mockData = Array.from({ length: 10 }).map((_, i) => ({
            id: `ch${i}`,
            updatedAt: 10000 - i, // 최신순 정렬을 위한 값
        }));
        mockGetChannelsByPlace.mockResolvedValue(mockData);
        mockGetJoinsByChannel.mockResolvedValue([]);

        // page: 1, limit: 3 이면 ch3, ch4, ch5가 나와야 함
        const { result } = renderHook(() => useChannels({ placeId: mockPlaceId, limit: 3, page: 1 }));

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.channels).toHaveLength(3);
        expect(result.current.channels[0].id).toBe('ch3');
        expect(result.current.channels[1].id).toBe('ch4');
        expect(result.current.channels[2].id).toBe('ch5');
    });

    it('관련 도메인 이벤트 수신 시 데이터를 다시 패칭한다', async () => {
        mockGetChannelsByPlace.mockResolvedValue([]);
        mockGetJoinsByChannel.mockResolvedValue([]);

        renderHook(() => useChannels({ placeId: mockPlaceId }));

        await waitFor(() => expect(mockGetChannelsByPlace).toHaveBeenCalledTimes(1));

        // channel 도메인 이벤트 발생 시뮬레이션
        act(() => {
            window.dispatchEvent(
                new CustomEvent(APP_SYNC_EVENT_NAME, {
                    detail: { domain: 'channel', cid: mockCloudId },
                })
            );
        });

        // 다시 패칭되었는지 확인
        await waitFor(() => expect(mockGetChannelsByPlace).toHaveBeenCalledTimes(2));
    });

    it('DB 로드 중 에러가 발생하면 isError가 true가 된다', async () => {
        mockGetChannelsByPlace.mockRejectedValue(new Error('DB Error'));

        const { result } = renderHook(() => useChannels({ placeId: mockPlaceId }));

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.isError).toBe(true);
    });
});
