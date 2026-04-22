import { useEffect } from 'react';
import type { AppSyncDetail } from './syncEvent';
import { APP_SYNC_CHANNEL_NAME, APP_SYNC_EVENT_NAME, getTabId } from './syncEvent';

/**
 * 다른 브라우저 탭에서 발생한 동기화 이벤트를 수신하여
 * 현재 탭의 로컬 Window 이벤트로 변환해주는 브릿지 훅
 * 브로드캐스트 채널 연결 -> 다른 탭에서 메시지가 날아오면 수신 -> 현재 탭의 UI 훅들이 들을 수 있도록 로컬 Window 이벤트로 재방출
 */
export const useBroadcastBridge = () => {
    useEffect(() => {
        const bc = new BroadcastChannel(APP_SYNC_CHANNEL_NAME);
        const myTabId = getTabId();
        bc.onmessage = (event: MessageEvent<AppSyncDetail & { _originTabId?: string }>) => {
            // 같은 탭에서 발신한 메시지는 무시 (이미 window.dispatchEvent로 직접 전달됨)
            if (event.data._originTabId === myTabId) return;
            const { _originTabId: _, ...detail } = event.data;
            console.debug(`[Broadcast Bridge] Received other tab message:`, detail);
            window.dispatchEvent(new CustomEvent(APP_SYNC_EVENT_NAME, { detail }));
        };

        return () => {
            bc.close();
        };
    }, []);
};
