import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/app-messages';
import { useWebSocketV2Store } from '@chatic/socket';

import { useRepositories } from '../data';
import type { DomainSite } from '@chatic/data';

/**
 * 플레이스(Site) 목록을 repository를 통해 조회하고, 실시간 동기화 이벤트에 반응하는 훅
 */
export const usePlaces = () => {
    const { site: siteRepository } = useRepositories();
    const cloudId = useWebSocketV2Store(s => s.cloudId);
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const prevCloudIdRef = useRef<string | undefined>(undefined);
    const requestSeqRef = useRef(0);

    const [places, setPlaces] = useState<DomainSite[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isError, setIsError] = useState(false);

    const fetchPlaces = useCallback(
        async (options?: { loading?: boolean; forceNetwork?: boolean }) => {
            const requestSeq = requestSeqRef.current + 1;
            requestSeqRef.current = requestSeq;

            if (options?.loading) setIsLoading(true);
            setIsSyncing(true);
            setIsError(false);

            try {
                // 초기 로딩 시에는 캐시 우선 사용, 갱신이 필요할 때만 network-only를 사용하도록 캐싱 최적화
                const cachePolicy = options?.forceNetwork ? 'network-only' : 'cache-first';
                const result = await siteRepository.fetchSite({}, { cachePolicy });
                if (requestSeqRef.current !== requestSeq) return;

                setPlaces((result.list ?? []) as DomainSite[]);
            } catch (error) {
                if (requestSeqRef.current !== requestSeq) return;

                logger.error('PLACE', 'Failed to fetch places from repository', { error });
                setIsError(true);
            } finally {
                if (requestSeqRef.current === requestSeq) {
                    setIsLoading(false);
                    setIsSyncing(false);
                }
            }
        },
        [siteRepository]
    );

    // cloudId가 변경되고 인증 완료 시 place 목록 재요청
    // place auth로 인한 isVerified 토글(같은 cloud)에서는 재요청하지 않음
    // places가 이미 있으면 (파이프라인이 먼저 가져온 경우) loading skeleton 표시 안 함
    useEffect(() => {
        if (!cloudId || !isVerified) return;
        if (prevCloudIdRef.current === cloudId) return;
        prevCloudIdRef.current = cloudId;
        void fetchPlaces({ loading: places.length === 0, forceNetwork: false });
    }, [fetchPlaces, cloudId, isVerified]);

    useEffect(() => {
        // 이벤트로 갱신이 필요할 때는 명시적으로 네트워크를 통해 최신 데이터를 가져옴
        const unsubCreate = siteRepository.onSiteCreated(() => {
            void fetchPlaces({ forceNetwork: true });
        });
        const unsubUpdate = siteRepository.onSiteUpdated(() => {
            void fetchPlaces({ forceNetwork: true });
        });
        return () => {
            unsubCreate();
            unsubUpdate();
        };
    }, [siteRepository, fetchPlaces]);

    return {
        places,
        isLoading,
        isSyncing,
        isError,
        refresh: () => void fetchPlaces({ forceNetwork: true }),
        sync: () => void fetchPlaces({ forceNetwork: true }),
    };
};
