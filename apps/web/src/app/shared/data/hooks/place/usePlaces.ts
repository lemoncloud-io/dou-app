import { useState, useEffect, useCallback } from 'react';
import { usePlaceRepository } from '../../repository';
import { useWebSocketV2 } from '@chatic/socket';
import { cloudCore } from '@chatic/web-core';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import type { CacheSiteView } from '@chatic/app-messages';

/**
 * 플레이스(Site) 목록 상태를 관리하고, 최신 데이터를 서버와 동기화하는 Query 훅
 */
export const usePlaces = () => {
    const repository = usePlaceRepository();
    const { emitAuthenticated } = useWebSocketV2();

    // 현재 최상위 환경에 설정된 클라우드 ID
    const cloudId = cloudCore.getSelectedCloudId() ?? 'default';

    const [places, setPlaces] = useState<MySiteView[]>([]);

    // DB 최초 조회 로딩 (스켈레톤 UI 용도)
    const [isLoading, setIsLoading] = useState(true);
    // 서버에 최신 목록을 요청하고 대기하는 상태 (상단 프로그레스바 등)
    const [isSyncing, setIsSyncing] = useState(false);
    // 데이터 조회 실패 상태
    const [isError, setIsError] = useState(false);

    /**
     * 로컬 DB에서 순수하게 데이터만 읽어오기
     */
    const loadFromDb = useCallback(async () => {
        try {
            setIsError(false);
            const data = await repository.getPlacesByCloud(cloudId);

            // UI 컴포넌트 스펙에 맞추기 위해 내부 캐시용 식별자 제거
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
     * 서버에 최신 플레이스 목록 동기화 요청 (Background Sync Request)
     */
    const requestSync = useCallback(() => {
        setIsSyncing(true);
        emitAuthenticated({ type: 'user', action: 'my-site' });

        // 서버 무응답 대비 5초 후 타임아웃 해제
        setTimeout(() => setIsSyncing(false), 5000);
    }, [emitAuthenticated]);

    /**
     * 초기 마운트 및 cloudId 변경 시: DB 로드 및 서버 갱신 동시 요청
     */
    useEffect(() => {
        void loadFromDb();
        requestSync();
    }, [loadFromDb, requestSync]);

    /**
     * 이벤트 버스 구독
     */
    useEffect(() => {
        if (!cloudId) return;

        const handleUpdate = (e: Event) => {
            const { detail } = e as CustomEvent;

            if (detail.cid === cloudId && detail.domain === 'user' && detail.subDomain === 'place') {
                void loadFromDb();
                setIsSyncing(false);
            }
        };

        window.addEventListener('local-db-updated', handleUpdate);
        return () => window.removeEventListener('local-db-updated', handleUpdate);
    }, [cloudId, loadFromDb]);

    return {
        places,
        isLoading,
        isSyncing,
        isError,
        refresh: () => {
            void loadFromDb();
            requestSync();
        },
    };
};
