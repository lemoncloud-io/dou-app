import { renderHook } from '@testing-library/react';
import { usePlaceRepository } from './usePlaceRepository';
import { createStorageAdapter } from '../storages';

jest.mock('../storages', () => ({
    createStorageAdapter: jest.fn(),
}));

describe('usePlaceRepository', () => {
    const mockCloudId = 'main-cloud';
    const mockPlaceDB = { loadAll: jest.fn(), load: jest.fn(), save: jest.fn(), saveAll: jest.fn(), delete: jest.fn() };

    beforeEach(() => {
        jest.clearAllMocks();
        (createStorageAdapter as jest.Mock).mockReturnValue(mockPlaceDB);
    });

    it('getPlacesByCloud: 동적으로 새로운 targetCloudId 어댑터를 생성하여 조회한다', async () => {
        const { result } = renderHook(() => usePlaceRepository(mockCloudId));

        await result.current.getPlacesByCloud('other-cloud');

        // 훅 생성 시 1번(main-cloud), 함수 내부에서 1번(other-cloud) 호출되어야 함
        expect(createStorageAdapter).toHaveBeenCalledWith('site', 'main-cloud');
        expect(createStorageAdapter).toHaveBeenCalledWith('site', 'other-cloud');
        expect(mockPlaceDB.loadAll).toHaveBeenCalled();
    });

    it('savePlaces: 배열을 받아 saveAll을 호출한다', async () => {
        const { result } = renderHook(() => usePlaceRepository(mockCloudId));
        const mockPlaces = [{ id: 'p1' }, { id: 'p2' }] as any[];

        await result.current.savePlaces(mockPlaces);
        expect(mockPlaceDB.saveAll).toHaveBeenCalledWith(mockPlaces);
    });
});
