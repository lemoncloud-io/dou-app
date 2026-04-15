// libs/socket-data/src/hooks/usePlaceMutations.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWebSocketV2 } from '@chatic/socket';
import { usePlaceRepository } from '../repository';
import { APP_SYNC_EVENT_NAME } from '../sync-events';
import { usePlaceMutations } from './usePlaceMutations';

jest.mock('@chatic/web-core', () => ({
    cloudCore: { getSelectedCloudId: jest.fn(() => 'test-cloud') },
}));
jest.mock('@chatic/socket', () => ({ useWebSocketV2: jest.fn() }));
jest.mock('../repository', () => ({ usePlaceRepository: jest.fn() }));

describe('usePlaceMutations', () => {
    const mockEmitAuthenticated = jest.fn();
    const mockGetPlace = jest.fn();

    const mockRepoInstance = {
        getPlace: mockGetPlace,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (useWebSocketV2 as unknown as jest.Mock).mockReturnValue({ emitAuthenticated: mockEmitAuthenticated });
        (usePlaceRepository as unknown as jest.Mock).mockReturnValue(mockRepoInstance);
    });

    it('makeSite: 이벤트 수신 시 DB에서 플레이스를 조회하여 반환한다', async () => {
        const mockNewSite = { id: 'site1', name: 'New Site', cid: 'test-cloud' };
        mockGetPlace.mockResolvedValue(mockNewSite);

        const { result } = renderHook(() => usePlaceMutations());

        let promiseResolved = false;
        let returnedSite: any;

        act(() => {
            result.current.makeSite({ name: 'New Site' }).then(res => {
                promiseResolved = true;
                returnedSite = res;
            });
        });

        expect(result.current.isPending['make-site']).toBe(true);

        act(() => {
            window.dispatchEvent(
                new CustomEvent(APP_SYNC_EVENT_NAME, {
                    detail: { domain: 'site', action: 'make-site', targetId: 'site1' },
                })
            );
        });

        await waitFor(() => expect(promiseResolved).toBe(true));

        expect(result.current.isPending['make-site']).toBe(false);
        expect(mockGetPlace).toHaveBeenCalledWith('site1');
        expect(returnedSite.cid).toBeUndefined();
        expect(returnedSite.id).toBe('site1');
    });

    it('updateSite: sid 파라미터 누락 시 즉시 reject 한다', async () => {
        const { result } = renderHook(() => usePlaceMutations());

        await expect(result.current.updateSite({} as any)).rejects.toThrow('sid is required');
    });
});
