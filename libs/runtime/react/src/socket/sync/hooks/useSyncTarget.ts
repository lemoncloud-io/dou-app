import { useCallback, useEffect, useState } from 'react';

import { primeChatRoom, RELAY_CLOUD_ID, registerSyncTarget, slotKeyOf, syncTargetKey } from '@chatic/runtime-client';
import type { SyncTargetDescriptor } from '@chatic/runtime-client';

import { useSlotVerified } from '../../../connection/hooks/useSlotVerified';
import { useSessionSelection } from '../../../session/hooks/session/readers/useSessionSelection';
import { useUidInCloud } from '../../../session/hooks/session/readers/useUidInCloud';

const useSelectedCid = (): string => useSessionSelection().selectedCloudId || RELAY_CLOUD_ID;

export const useSyncTarget = (target: SyncTargetDescriptor | null, cid?: string): void => {
    const key = syncTargetKey(target);
    const selectedCid = useSelectedCid();
    const targetCid = cid ?? selectedCid;
    const uid = useUidInCloud(targetCid);

    useEffect(() => {
        if (!target) return;
        return registerSyncTarget(target, { cid: targetCid });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, targetCid, uid]);
};

export type ChatPrimeStatus = 'pending' | 'ready' | 'failed';

export interface ChatSyncState {
    prime: ChatPrimeStatus;
    retryPrime: () => void;
}

const usePrimeChat = (channelId: string | undefined, cid: string): ChatSyncState => {
    const isVerified = useSlotVerified(slotKeyOf(cid));
    const scope = channelId ? `${cid}:${channelId}` : null;
    const [settled, setSettled] = useState<{ scope: string; status: 'ready' | 'failed' } | null>(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!isVerified || !channelId) return;
        let cancelled = false;
        void primeChatRoom(cid, channelId, { cancelled: () => cancelled }).then(outcome => {
            if (!cancelled && outcome !== 'cancelled') {
                setSettled({ scope: `${cid}:${channelId}`, status: outcome });
            }
        });
        return () => {
            cancelled = true;
        };
    }, [isVerified, channelId, cid, attempt]);

    const retryPrime = useCallback(() => {
        setSettled(null);
        setAttempt(n => n + 1);
    }, []);

    return { prime: settled && settled.scope === scope ? settled.status : 'pending', retryPrime };
};

export const useChatSync = (channelId?: string, intervalMs?: number): ChatSyncState => {
    const cid = useSelectedCid();
    useSyncTarget(channelId ? { type: 'chat', id: channelId, ...(intervalMs ? { intervalMs } : {}) } : null, cid);
    return usePrimeChat(channelId, cid);
};

export const useChannelSync = (channelId?: string, intervalMs?: number): void =>
    useSyncTarget(channelId ? { type: 'channel', id: channelId, ...(intervalMs ? { intervalMs } : {}) } : null);

export const usePlaceSync = (placeId?: string, intervalMs?: number): void =>
    useSyncTarget(placeId ? { type: 'place', id: placeId, ...(intervalMs ? { intervalMs } : {}) } : null);
