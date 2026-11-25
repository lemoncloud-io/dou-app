import { useCallback, useEffect } from 'react';

import { runtime } from '@chatic/runtime-react';

interface ReadCount {
    readCount: number;
    unreadCount: number;
}

export const useJoinPositions = (
    cid: string,
    channelId: string | null,
    activeMemberIds: string[],
    memberIds: string[],
    cursorByUser: Map<string, number>,
    isMember: boolean
) => {
    const isVerified = runtime.connection.useCloudVerified(cid);
    const uid = runtime.session.useUidInCloud(cid);

    const memberKey = memberIds.join(',');
    useEffect(() => {
        if (!channelId || !isVerified || !isMember || memberIds.length === 0) return;
        const disposers = memberIds.map(userId =>
            runtime.sync.registerSyncTarget({ type: 'join', id: `${channelId}@${userId}` }, { cid })
        );
        return () => disposers.forEach(dispose => dispose());
    }, [cid, channelId, isVerified, isMember, memberKey, uid]);

    const memberCount = activeMemberIds.length;
    const isReady = memberCount > 0 && cursorByUser.size > 0;

    const getReadCount = useCallback(
        (chatNo: number): ReadCount => {
            let readCount = 0;
            for (const userId of activeMemberIds) {
                if ((cursorByUser.get(userId) ?? 0) >= chatNo) readCount++;
            }
            return { readCount, unreadCount: Math.max(0, memberCount - readCount) };
        },
        [activeMemberIds, cursorByUser, memberCount]
    );

    const getReaders = useCallback(
        (chatNo: number): string[] => activeMemberIds.filter(userId => (cursorByUser.get(userId) ?? 0) >= chatNo),
        [activeMemberIds, cursorByUser]
    );

    return { getReadCount, getReaders, isReady };
};
