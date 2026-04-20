import { useEffect } from 'react';
import type { AppSyncDetail } from './syncEvent';
import { APP_SYNC_CHANNEL_NAME, APP_SYNC_EVENT_NAME } from './syncEvent';

/**
 * 다른 브라우저 탭에서 발생한 동기화 이벤트를 수신하여
 * 현재 탭의 로컬 Window 이벤트로 변환해주는 브릿지 훅
 * 브로드캐스트 채널 연결 -> 다른 탭에서 메시지가 날아오면 수신 -> 현재 탭의 UI 훅들이 들을 수 있도록 로컬 Window 이벤트로 재방출
 */
export const useBroadcastBridge = () => {
    useEffect(() => {
        const bc = new BroadcastChannel(APP_SYNC_CHANNEL_NAME);
        bc.onmessage = (event: MessageEvent<AppSyncDetail>) => {
            console.debug(`[Broadcast Bridge] Received other tab message:`, event.data);
            window.dispatchEvent(new CustomEvent(APP_SYNC_EVENT_NAME, { detail: event.data }));
        };

        return () => {
            bc.close();
        };
    }, []);
};
