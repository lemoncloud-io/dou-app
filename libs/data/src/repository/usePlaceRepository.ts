import { useCallback, useMemo } from 'react';
import { createStorageAdapter } from '../storages';
import type { CacheSiteView } from '@chatic/app-messages';

/**
 * 플레이스(Site) 데이터 관리 레퍼지토리
 * 서버와의 연동 없이 로컬 DB(IndexedDB 등)와의 직접적인 입출력을 전담
 */
export const usePlaceRepository = (cloudId: string) => {
    const placeDB = useMemo(() => (cloudId ? createStorageAdapter('site', cloudId) : null), [cloudId]);

    /**
     * 전체 Place 목록 조회
     */
    const getPlaces = useCallback(
        async (): Promise<CacheSiteView[]> => (placeDB ? await placeDB.loadAll() : []),
        [placeDB]
    );

    /**
     *  특정 cloudId에 대한 Place 목록 조회
     */
    const getPlacesByCloud = useCallback(async (targetCloudId: string): Promise<CacheSiteView[]> => {
        if (!targetCloudId) return [];
        const targetDB = createStorageAdapter('site', targetCloudId);
        const places: CacheSiteView[] = await targetDB.loadAll();
        return places?.filter((place: CacheSiteView) => place.cid === targetCloudId) ?? [];
    }, []);

    /**
     *  특정 ID를 가진 단일 Place 조회
     */
    const getPlace = useCallback(
        async (id: string): Promise<CacheSiteView | null> => {
            if (!placeDB) return null;
            return await placeDB.load(id);
        },
        [placeDB]
    );

    /**
     * 단일 Place 저장
     */
    const savePlace = useCallback(
        async (id: string, place: CacheSiteView) => {
            if (placeDB) {
                await placeDB.save(id, place);
            }
        },
        [placeDB]
    );

    /**
     * 다중 Place 일괄 저장
     */
    const savePlaces = useCallback(
        async (places: CacheSiteView[]): Promise<void> => {
            if (placeDB && places.length > 0) {
                await placeDB.saveAll(places);
            }
        },
        [placeDB]
    );

    /**
     * 특정 Place 삭제
     */
    const deletePlace = useCallback(
        async (id: string): Promise<void> => {
            if (placeDB) await placeDB.delete(id);
        },
        [placeDB]
    );

    return useMemo(
        () => ({
            cloudId,
            getPlaces,
            getPlacesByCloud,
            getPlace,
            savePlace,
            savePlaces,
            deletePlace,
        }),
        [cloudId, getPlaces, getPlacesByCloud, getPlace, savePlace, savePlaces, deletePlace]
    );
};
