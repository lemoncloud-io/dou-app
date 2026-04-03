import { useChatCacheSync } from './useChatCacheSync';

/**
 * 앱 전역에서 요구되는 캐시 동기화 훅들을 중앙에서 실행하는 진입점 훅입니다.
 * 향후 사용자 상태, 알림 등 다른 도메인의 동기화 로직이 추가될 경우 이곳에 통합합니다.
 */
export const useGlobalCacheSync = () => {
    // 채팅 도메인에 대한 로컬 캐시 동기화 실행
    useChatCacheSync();
};
