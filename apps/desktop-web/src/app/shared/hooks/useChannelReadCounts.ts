import { useCallback, useEffect, useMemo, useState } from 'react';

import { isInJoinWindow, RELAY_CLOUD_ID, runtime } from '@chatic/runtime-react';
import type { DomainChannel, DomainJoin } from '@chatic/runtime-react';

import { channelKind } from '../utils';

export interface ReadCount {
    readIds: string[];
    unreadIds: string[];
}

export interface MemberReadCursor {
    userId: string;
    cursor: number;
    joinedNo?: number;
}

export interface ChannelReadCounts {
    readCountOf: (chatNo: number, authorId: string) => ReadCount | null;
    cursors: MemberReadCursor[];
}

export const useChannelReadCounts = (channel: DomainChannel | undefined): ChannelReadCounts => {
    const { join: joinRepository } = runtime.data.useRuntimeRepositories();
    const channelId = channel?.id ?? null;
    const cid = channel ? channel.cid || RELAY_CLOUD_ID : '';
    const userId = runtime.session.useUidInCloud(cid);
    const isVerified = runtime.connection.useCloudVerified(cid);

    const [observed, setObserved] = useState<{ channelId: string | null; joins: DomainJoin[] }>({
        channelId: null,
        joins: [],
    });
    const joins = observed.channelId === channelId ? observed.joins : [];

    useEffect(() => {
        if (!channelId) return;
        return joinRepository.observeList({ channelId, activeOnly: false }, result =>
            setObserved({ channelId, joins: result?.list ?? [] })
        );
    }, [joinRepository, channelId]);

    const activeMembers = useMemo(() => {
        const byUser = new Map<string, { userId: string; cursor: number; joinedNo?: number }>();
        for (const join of joins) {
            if (!join.userId || join.joined === 0) continue;
            byUser.set(join.userId, {
                userId: join.userId,
                cursor: Math.max(join.readNo ?? 0, join.chatNo ?? 0),
                joinedNo: join.joinedNo,
            });
        }
        return [...byUser.values()];
    }, [joins]);

    const isMember =
        !!userId &&
        (!!channel?.memberIds?.includes(userId) || joins.some(join => join.userId === userId && join.joined !== 0));
    const memberIds = useMemo(() => {
        const ids = new Set(channel?.memberIds ?? []);
        if (userId) ids.add(userId);
        return [...ids];
    }, [channel?.memberIds, userId]);
    const memberKey = memberIds.join(',');

    useEffect(() => {
        if (!channelId || !isVerified || !isMember) return;
        const disposers = memberIds.map(memberId =>
            runtime.sync.registerSyncTarget({ type: 'join', id: `${channelId}@${memberId}` }, { cid })
        );
        return () => disposers.forEach(dispose => dispose());
    }, [cid, channelId, isVerified, isMember, memberKey, userId]);

    const showsCounts = !!channel && channelKind(channel) !== 'self' && activeMembers.length >= 2;

    const readCountOf = useCallback(
        (chatNo: number, authorId: string): ReadCount | null => {
            if (!showsCounts) return null;
            const readIds: string[] = [];
            const unreadIds: string[] = [];
            for (const member of activeMembers) {
                if (member.userId === authorId || !isInJoinWindow({ chatNo }, member.joinedNo)) continue;
                (member.cursor >= chatNo ? readIds : unreadIds).push(member.userId);
            }
            return readIds.length + unreadIds.length > 0 ? { readIds, unreadIds } : null;
        },
        [showsCounts, activeMembers]
    );

    const cursors = useMemo(
        () =>
            showsCounts && userId
                ? activeMembers
                      .filter(member => member.userId !== userId)
                      .map(({ userId: memberId, cursor, joinedNo }) => ({ userId: memberId, cursor, joinedNo }))
                : [],
        [showsCounts, activeMembers, userId]
    );

    return useMemo(() => ({ readCountOf, cursors }), [readCountOf, cursors]);
};
