import { useEffect } from 'react';
import { useWebSocketV2Store } from '@chatic/socket';
import { usePlaceRepository } from '../repository';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import type { CacheSiteView } from '@chatic/app-messages';

/**
 * 앱 백그라운드에서 동작하며, 워크스페이스(Place/Site) 관련 소켓 이벤트를 수신
 * 로컬 IndexedDB와 동기화하고 전역 UI 갱신 이벤트를 방출하는 Sync 훅
 */
export const usePlaceCacheSync = () => {
    const placeRepository = usePlaceRepository();

    useEffect(() => {
        const unsubscribe = useWebSocketV2Store.subscribe(
            state => state.lastMessage,
            async (envelope: any) => {
                if (!envelope || envelope.type !== 'user') return;

                // 현재 앱이 바라보는 클라우드 환경과 패킷의 타겟 환경이 일치하는지 검증
                const cloudId = useWebSocketV2Store.getState().cloudId;
                if (!cloudId || placeRepository.cloudId !== cloudId) return;

                const { action, payload } = envelope;

                if (!payload) return;

                let isDbUpdated = false;
                let targetSiteId: string | undefined;

                switch (action) {
                    // 내 전체 워크스페이스 목록을 수신
                    case 'my-site': {
                        const siteList = payload?.list as MySiteView[];
                        if (siteList && siteList.length > 0) {
                            const cacheSiteList: CacheSiteView[] = siteList.map(site => ({
                                ...site,
                                cid: cloudId,
                            }));
                            await placeRepository.savePlaces(cacheSiteList);
                            isDbUpdated = true;
                        }
                        break;
                    }

                    /**
                     * 워크스페이스가 새로 생성되거나 정보가 수정되었을 때에 대한 케이스
                     * 어떤 Place가 갱신되었는지 Mutation 훅에게 알려주기 위해 ID 기록
                     */
                    case 'make-site':
                    case 'update-site': {
                        const site = payload?.site$ ?? payload;
                        if (site?.id) {
                            const cacheSite: CacheSiteView = {
                                ...site,
                                cid: cloudId,
                            };

                            await placeRepository.savePlace(site.id, cacheSite);
                            isDbUpdated = true;
                            targetSiteId = site.id;
                        }
                        break;
                    }
                }

                if (isDbUpdated) {
                    notifyPlaceDbUpdated({
                        domain: 'user',
                        subDomain: 'place',
                        cid: cloudId,
                        targetSiteId: targetSiteId,
                    });
                }
            }
        );

        return () => unsubscribe();
    }, [placeRepository]);
};

/**
 * 로컬 DB가 갱신되었음을 현재 브라우저 탭(CustomEvent)과
 * 다른 브라우저 탭(BroadcastChannel)의 모든 UI 컴포넌트에게 알리는 유틸리티 함수
 */
export const notifyPlaceDbUpdated = (detail: {
    domain: string;
    subDomain: string;
    cid: string;
    targetSiteId?: string;
}) => {
    window.dispatchEvent(new CustomEvent('local-db-updated', { detail }));
    const bc = new BroadcastChannel('app-db-sync');
    bc.postMessage(detail);
    bc.close();
};
