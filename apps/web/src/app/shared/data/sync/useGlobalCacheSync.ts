import { useChatCacheSync } from './useChatCacheSync';
import { useChannelCacheSync } from './useChannelCacheSync';
import { useUserCacheSync } from './useUserCacheSync';
import { usePlaceCacheSync } from './usePlaceCacheSync';
import { useJoinCacheSync } from './useJoinCacheSync';

/**
 * 앱 전역에서 요구되는 캐시 동기화 훅들을 중앙에서 실행하는 진입점 훅입니다.
 * 향후 사용자 상태, 알림 등 다른 도메인의 동기화 로직이 추가될 경우 이곳에 통합합니다.
 */
export const useGlobalCacheSync = () => {
    useChatCacheSync();
    useChannelCacheSync();
    useUserCacheSync();
    usePlaceCacheSync();
    useJoinCacheSync();
};
