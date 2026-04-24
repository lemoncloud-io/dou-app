import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlaceLocalDataSource } from '../local/data-sources';
import { useWebSocketV2 } from '@chatic/socket';
import { cloudCore } from '@chatic/web-core';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import type { CacheSiteView } from '@chatic/app-messages';
import type { AppSyncDetail } from '../sync-events';
import { APP_SYNC_EVENT_NAME } from '../sync-events';
import { shouldEmit } from '../requestDedup';
import { useConnectionRecoverySync } from './useConnectionRecoverySync';

/**
 * 플레이스(Site) 목록 상태를 관리하고, 최신 데이터를 서버와 동기화하는 Query 훅
 */
export const usePlaces = () => {
    const { emitAuthenticated, cloudId: socketCloudId } = useWebSocketV2();
    const cloudId = cloudCore.getSelectedCloudId() || socketCloudId || 'default';
    const repository = usePlaceLocalDataSource(cloudId);

    const [places, setPlaces] = useState<MySiteView[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isError, setIsError] = useState(false);
    const isSyncingRef = useRef(false);

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

            // 캐시에 데이터가 있거나 네트워크 sync가 끝났으면 로딩 해제
            // 캐시가 비어있고 sync 진행 중이면 서버 응답까지 로딩 유지
            if (uiPlaces.length > 0 || !isSyncingRef.current) {
                setIsLoading(false);
            }
        } catch (error) {
            console.error('Failed to load places from DB:', error);
            setIsError(true);
            setIsLoading(false);
        }
    }, [repository, cloudId]);

    /**
     * 서버에 최신 플레이스 목록 동기화 요청
     */
    const requestFromNetwork = useCallback(
        (force = false) => {
            if (!force && !shouldEmit('user:my-site')) return;

            isSyncingRef.current = true;
            setIsSyncing(true);
            emitAuthenticated({
                type: 'user',
                action: 'my-site',
            });

            setTimeout(() => {
                isSyncingRef.current = false;
                setIsSyncing(false);
                setIsLoading(false);
            }, 5000);
        },
        [emitAuthenticated]
    );

    /**
     *  초기 마운트 시 동시 요청
     */
    useEffect(() => {
        setIsLoading(true);
        void requestFromLocal();
        requestFromNetwork(true);
    }, [requestFromLocal, requestFromNetwork]);

    /**
     * 통합 이벤트 버스 구독
     */
    useEffect(() => {
        if (!cloudId) return;

        const handleUpdate = (e: Event) => {
            const { detail } = e as CustomEvent<AppSyncDetail>;
            if (detail.domain === 'site' && detail.cid === cloudId) {
                isSyncingRef.current = false;
                setIsSyncing(false);
                void requestFromLocal();
            }
        };

        window.addEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
        return () => window.removeEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
    }, [cloudId, requestFromLocal]);

    // WebSocket 재연결 완료(isVerified: false→true) 시 서버에 places 재요청
    useConnectionRecoverySync(requestFromLocal, requestFromNetwork);

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
