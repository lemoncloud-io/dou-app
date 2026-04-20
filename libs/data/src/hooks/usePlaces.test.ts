// libs/data/src/hooks/usePlaces.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWebSocketV2 } from '@chatic/socket';
import { usePlaceRepository } from '../repository';
import { APP_SYNC_EVENT_NAME } from '../sync-events';
import { usePlaces } from './usePlaces';

jest.mock('@chatic/web-core', () => ({
    useDynamicProfile: jest.fn(() => ({ uid: 'test-user' })),
    cloudCore: {
        getConfig: jest.fn(),
    },
}));
jest.mock('@chatic/socket', () => ({ useWebSocketV2: jest.fn() }));
jest.mock('../repository', () => ({ usePlaceRepository: jest.fn() }));

describe('usePlaces', () => {
    const mockEmitAuthenticated = jest.fn();
    const mockGetPlacesByCloud = jest.fn();
    const mockCloudId = 'test-cloud';

    const mockRepoInstance = {
        getPlacesByCloud: mockGetPlacesByCloud,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (useWebSocketV2 as jest.Mock).mockReturnValue({
            emitAuthenticated: mockEmitAuthenticated,
            cloudId: mockCloudId,
        });
        (usePlaceRepository as jest.Mock).mockReturnValue(mockRepoInstance);
    });

    it('DB 데이터를 로드하고 네트워크 동기화를 요청한다', async () => {
        // cid가 포함된 캐시 모델 반환
        mockGetPlacesByCloud.mockResolvedValue([
            { id: 'place1', name: 'Company', cid: mockCloudId },
            { id: 'place2', name: 'Team', cid: mockCloudId },
        ]);

        const { result } = renderHook(() => usePlaces());

        expect(result.current.isLoading).toBe(true);
        expect(result.current.isSyncing).toBe(true);

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        // DB에서 가져온 데이터 중 cid 필드가 제거되었는지 검증
        expect(result.current.places).toHaveLength(2);
        expect((result.current.places[0] as any).cid).toBeUndefined();
        expect(result.current.places[0].id).toBe('place1');

        // 소켓 요청 검증
        expect(mockEmitAuthenticated).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'user', action: 'my-site' })
        );
    });

    it('site 도메인 이벤트 수신 시 데이터를 다시 패칭한다', async () => {
        mockGetPlacesByCloud.mockResolvedValue([]);
        renderHook(() => usePlaces());

        await waitFor(() => expect(mockGetPlacesByCloud).toHaveBeenCalledTimes(1));

        act(() => {
            window.dispatchEvent(
                new CustomEvent(APP_SYNC_EVENT_NAME, {
                    detail: { domain: 'site', cid: mockCloudId },
                })
            );
        });

        await waitFor(() => expect(mockGetPlacesByCloud).toHaveBeenCalledTimes(2));
    });

    it('DB 로드 중 에러 발생 시 isError 상태가 true가 된다', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        mockGetPlacesByCloud.mockRejectedValue(new Error('DB Error'));
        const { result } = renderHook(() => usePlaces());

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.isError).toBe(true);
        expect(result.current.places).toEqual([]);

        consoleSpy.mockRestore();
    });
});
