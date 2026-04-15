// libs/socket-data/src/hooks/useChannels.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWebSocketV2 } from '@chatic/socket';
import { useChannelRepository } from '../repository';
import { APP_SYNC_EVENT_NAME } from '../sync-events';
import { useChannels } from './useChannels';

// 환경 변수 파싱 에러 방지
jest.mock('@chatic/web-core', () => ({
    useDynamicProfile: jest.fn(() => ({ uid: 'test-user' })),
    cloudCore: { getConfig: jest.fn() },
}));

jest.mock('@chatic/socket', () => ({ useWebSocketV2: jest.fn() }));
jest.mock('../repository', () => ({ useChannelRepository: jest.fn() }));

describe('useChannels', () => {
    const mockEmitAuthenticated = jest.fn();
    const mockGetChannelsByPlace = jest.fn();
    const mockCloudId = 'test-cloud';
    const mockPlaceId = 'place-1';

    const mockRepoInstance = {
        cloudId: mockCloudId,
        getChannelsByPlace: mockGetChannelsByPlace,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (useWebSocketV2 as jest.Mock).mockReturnValue({
            emitAuthenticated: mockEmitAuthenticated,
            cloudId: mockCloudId,
        });
        (useChannelRepository as jest.Mock).mockReturnValue(mockRepoInstance);
    });

    it('마운트 시 DB 조회 및 최신순 정렬, 네트워크 동기화 요청을 수행한다', async () => {
        const mockData = [
            { id: 'ch1', sid: 'sid1', updatedAt: 1000 },
            { id: 'ch2', sid: 'sid2', lastChat$: { createdAt: 3000 } },
            { id: 'ch3', sid: 'sid3', updatedAt: 2000 },
        ];
        mockGetChannelsByPlace.mockResolvedValue(mockData);

        const { result } = renderHook(() => useChannels({ placeId: mockPlaceId }));

        expect(result.current.isLoading).toBe(true);
        expect(result.current.isSyncing).toBe(true);

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        // 소켓 호출 검증
        expect(mockEmitAuthenticated).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'chat', action: 'mine', payload: { placeId: mockPlaceId } })
        );

        // 정렬 및 데이터 매핑(sid 제거) 검증: ch2(3000) -> ch3(2000) -> ch1(1000)
        expect(result.current.channels[0].id).toBe('ch2');
        expect(result.current.channels[1].id).toBe('ch3');
        expect(result.current.channels[2].id).toBe('ch1');
        expect((result.current.channels[0] as any).sid).toBeUndefined();
    });

    it('limit과 page 파라미터를 적용하여 페이지네이션 처리한다', async () => {
        const mockData = Array.from({ length: 10 }).map((_, i) => ({
            id: `ch${i}`,
            updatedAt: 10000 - i, // 최신순: ch0, ch1, ... ch9
        }));
        mockGetChannelsByPlace.mockResolvedValue(mockData);

        // page: 1, limit: 3 이면 ch3, ch4, ch5 가 나와야 함
        const { result } = renderHook(() => useChannels({ placeId: mockPlaceId, limit: 3, page: 1 }));

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.channels).toHaveLength(3);
        expect(result.current.channels[0].id).toBe('ch3');
    });

    it('channel 및 chat 도메인 이벤트 수신 시 데이터를 다시 패칭한다', async () => {
        mockGetChannelsByPlace.mockResolvedValue([]);
        renderHook(() => useChannels({ placeId: mockPlaceId }));

        await waitFor(() => expect(mockGetChannelsByPlace).toHaveBeenCalledTimes(1));

        act(() => {
            window.dispatchEvent(
                new CustomEvent(APP_SYNC_EVENT_NAME, {
                    detail: { domain: 'channel', cid: mockCloudId },
                })
            );
        });

        await waitFor(() => expect(mockGetChannelsByPlace).toHaveBeenCalledTimes(2));
    });
});
