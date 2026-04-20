import { useBroadcastBridge, useGlobalSocketRouter } from './sync-events';

/**
 * 데이터 동기화를 위한 모든 백그라운드 워커를 실행합니다.
 * 최상단 컴포넌트에서 단 한 번만 호출
 */
export const useDataSync = () => {
    useGlobalSocketRouter();
    useBroadcastBridge();
};
