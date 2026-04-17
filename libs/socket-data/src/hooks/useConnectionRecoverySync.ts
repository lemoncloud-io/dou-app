import { useEffect } from 'react';
import { useWebSocketV2Store } from '@chatic/socket';
import { FOREGROUND_RESYNC_EVENT_NAME } from '../sync-events';

/**
 * 포그라운드 복귀 및 WebSocket 재연결 완료 시 데이터 재동기화를 트리거하는 공통 훅
 *
 * 두 가지 시나리오를 커버:
 * 1. 소켓이 살아있는 상태에서 포그라운드 복귀 → foreground-resync 이벤트 수신
 * 2. 소켓 재연결 완료 → isVerified false→true 전환 감지
 */
export const useConnectionRecoverySync = (
    requestFromLocal: () => Promise<void> | void,
    requestFromNetwork: () => void
) => {
    // 포그라운드 복귀 시 로컬 DB 재조회 + 서버 재동기화
    useEffect(() => {
        const handleForegroundResync = () => {
            void requestFromLocal();
            requestFromNetwork();
        };
        window.addEventListener(FOREGROUND_RESYNC_EVENT_NAME, handleForegroundResync);
        return () => window.removeEventListener(FOREGROUND_RESYNC_EVENT_NAME, handleForegroundResync);
    }, [requestFromLocal, requestFromNetwork]);

    // WebSocket 재연결 완료(isVerified: false→true) 시 서버 재동기화
    // 포그라운드 복귀 시점에 아직 재연결이 완료되지 않은 경우의 타이밍 gap을 커버
    useEffect(() => {
        let prevVerified = useWebSocketV2Store.getState().isVerified;
        const unsubscribe = useWebSocketV2Store.subscribe(
            s => s.isVerified,
            isVerified => {
                if (isVerified && !prevVerified) {
                    void requestFromLocal();
                    requestFromNetwork();
                }
                prevVerified = isVerified;
            }
        );
        return () => unsubscribe();
    }, [requestFromLocal, requestFromNetwork]);
};
