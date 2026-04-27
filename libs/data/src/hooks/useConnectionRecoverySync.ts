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
    // 단, place/cloud 전환에 의한 in-session auth 갱신(소켓 연결 유지)은 제외
    useEffect(() => {
        let prevVerified = useWebSocketV2Store.getState().isVerified;
        // 초기값 false: 최초 연결은 recovery가 아님 — 실제 끊김(true→false) 발생 후에만 recovery 트리거
        let hadDisconnection = false;

        // 소켓 연결 끊김 추적 — 실제 재연결과 in-session auth 갱신을 구분하기 위함
        const unsubConnected = useWebSocketV2Store.subscribe(
            s => s.isConnected,
            isConnected => {
                if (!isConnected) {
                    hadDisconnection = true;
                }
            }
        );

        const unsubVerified = useWebSocketV2Store.subscribe(
            s => s.isVerified,
            isVerified => {
                if (isVerified && !prevVerified && hadDisconnection) {
                    // 실제 소켓 재연결 후 인증 완료된 경우에만 재동기화
                    void requestFromLocal();
                    requestFromNetwork();
                }
                if (isVerified) {
                    hadDisconnection = false;
                }
                prevVerified = isVerified;
            }
        );

        return () => {
            unsubConnected();
            unsubVerified();
        };
    }, [requestFromLocal, requestFromNetwork]);
};
