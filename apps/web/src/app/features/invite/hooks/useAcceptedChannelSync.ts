import { useEffect, useState } from 'react';

import { runtime } from '@chatic/runtime';

const SYNC_TIMEOUT_MS = 8_000;

export type AcceptedChannelSyncStatus = 'unknown' | 'waiting' | 'ready' | 'timeout';

export const useAcceptedChannelSync = (channelId: string | undefined): { status: AcceptedChannelSyncStatus } => {
    const { channel } = runtime.data.useRuntimeRepositories();
    const [status, setStatus] = useState<AcceptedChannelSyncStatus>(channelId ? 'waiting' : 'unknown');

    useEffect(() => {
        if (!channelId) {
            setStatus('unknown');
            return;
        }

        setStatus('waiting');
        let settled = false;

        const unsubscribe = channel.observeItem(channelId, item => {
            if (settled || !item) return;
            settled = true;
            setStatus('ready');
        });

        const timeoutId = setTimeout(() => {
            if (settled) return;
            settled = true;
            setStatus('timeout');
        }, SYNC_TIMEOUT_MS);

        return () => {
            unsubscribe();
            clearTimeout(timeoutId);
        };
    }, [channel, channelId]);

    return { status };
};
