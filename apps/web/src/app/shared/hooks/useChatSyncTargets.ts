import { useEffect } from 'react';

import { getSocketRuntime, useWebSocketV2Store } from '@chatic/socket';

interface SyncableChannel {
    id?: string;
    chatNo?: number;
}

/**
 * 채널별 chat sync target을 DeviceSocketRuntime에 등록합니다.
 * ChatSyncPlan이 scheduler에 등록되어 있으면 interval + push trigger로 동기화를 수행합니다.
 */
export const useChatSyncTargets = (channels: SyncableChannel[]) => {
    const isConnected = useWebSocketV2Store(s => s.isConnected);

    useEffect(() => {
        const runtime = getSocketRuntime();
        if (!runtime || !isConnected) return;

        for (const ch of channels) {
            if (!ch.id || !ch.chatNo) continue;
            runtime.startSync({
                type: 'chat',
                id: ch.id,
                meta: { serverChatNo: ch.chatNo },
            });
        }

        return () => {
            const rt = getSocketRuntime();
            if (!rt) return;
            for (const target of rt.listSyncTargets()) {
                if (target.type === 'chat') rt.stopSync(target);
            }
        };
    }, [channels, isConnected]);
};
