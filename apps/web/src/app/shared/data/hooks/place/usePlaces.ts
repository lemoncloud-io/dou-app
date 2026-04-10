import { useCallback, useEffect, useState } from 'react';
import { usePlaceRepository } from '../../repository';
import { useWebSocketV2 } from '@chatic/socket';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import type { CacheSiteView } from '@chatic/app-messages';
import type { AppSyncDetail } from '../../sync';
import { APP_SYNC_EVENT_NAME } from '../../sync';

/**
 * 플레이스(Site) 목록 상태를 관리하고, 최신 데이터를 서버와 동기화하는 Query 훅
 */
export const usePlaces = () => {
    const { emitAuthenticated, cloudId } = useWebSocketV2();
    const repository = usePlaceRepository(cloudId);

    const [places, setPlaces] = useState<MySiteView[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isError, setIsError] = useState(false);

    /**
     *  로컬 DB에서 데이터 읽어오기
     */
    const requestFromLocal = useCallback(async () => {
        try {
            setIsError(false);
            const data = await repository.getPlacesByCloud(cloudId);

            const uiPlaces = data.map(place => {
                const { cid, ...rest } = place as CacheSiteView;
                return rest as MySiteView;
            });

            setPlaces(uiPlaces);
        } catch (error) {
            console.error('Failed to load places from DB:', error);
            setIsError(true);
        } finally {
            setIsLoading(false);
        }
    }, [repository, cloudId]);

    /**
     * 서버에 최신 플레이스 목록 동기화 요청
     */
    const requestFromNetwork = useCallback(() => {
        setIsSyncing(true);
        emitAuthenticated({
            type: 'user',
            action: 'my-site',
        });

        setTimeout(() => setIsSyncing(false), 5000);
    }, [emitAuthenticated]);

    /**
     *  초기 마운트 시 동시 요청
     */
    useEffect(() => {
        void requestFromLocal();
        requestFromNetwork();
    }, [requestFromLocal, requestFromNetwork]);

    /**
     * 통합 이벤트 버스 구독
     */
    useEffect(() => {
        if (!cloudId) return;

        const handleUpdate = (e: Event) => {
            const { detail } = e as CustomEvent<AppSyncDetail>;
            if (detail.domain === 'site' && detail.cid === cloudId) {
                void requestFromLocal();
                setIsSyncing(false);
            }
        };

        window.addEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
        return () => window.removeEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
    }, [cloudId, requestFromLocal]);

    return {
        places,
        isLoading,
        isSyncing,
        isError,
        refresh: () => {
            void requestFromLocal();
            requestFromNetwork();
        },
        sync: () => requestFromNetwork(),
    };
};
