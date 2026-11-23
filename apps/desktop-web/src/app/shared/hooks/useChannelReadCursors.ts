import { useEffect, useState } from 'react';

import { RELAY_CLOUD_ID, runtime } from '@chatic/runtime';
import type { DomainChannel } from '@chatic/runtime';

import type { ReadCursor } from '../utils';

export const useChannelReadCursors = (channels: DomainChannel[]): Record<string, ReadCursor> => {
    const { join: joinRepository } = runtime.data.useRuntimeRepositories();
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const cid = channels[0]?.cid || RELAY_CLOUD_ID;
    const userId = runtime.session.useUidInCloud(cid);
    const isVerified = runtime.connection.useCloudVerified(cid);

    const [cursorByChannel, setCursorByChannel] = useState<Record<string, ReadCursor>>({});

    const channelKey = channels.map(c => c.id).join(',');

    useEffect(() => {
        if (!userId || !isVerified || channels.length === 0) return;

        const disposers = channels.flatMap(channel => {
            const channelId = channel.id;
            if (!channelId) return [];
            const unregJoin = runtime.sync.registerSyncTarget({ type: 'join', id: `${channelId}@${userId}` }, { cid });
            const unsubObserve = joinRepository.observeList({ channelId }, result => {
                const mine = (result?.list ?? []).find(j => j.userId === userId && j.channelId === channelId);
                if (!mine) return;
                const chatNo = mine.chatNo ?? 0;
                const metaNo = mine.metaNo;
                setCursorByChannel(prev => {
                    const curr = prev[channelId];
                    if (curr?.chatNo === chatNo && curr?.metaNo === metaNo) return prev;
                    return { ...prev, [channelId]: { chatNo, metaNo } };
                });
            });
            return [unregJoin, unsubObserve];
        });

        return () => disposers.forEach(dispose => dispose());
    }, [joinRepository, cid, userId, isVerified, channelKey, selectedSiteId]);

    return cursorByChannel;
};
