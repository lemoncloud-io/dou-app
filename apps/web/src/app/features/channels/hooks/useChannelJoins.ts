import { useEffect, useMemo, useState } from 'react';

import { runtime, type DomainJoin } from '@chatic/runtime-react';

export interface ChannelJoins {
    joins: DomainJoin[];
    myJoin: DomainJoin | null;
    activeMemberIds: string[];
    cursorByUser: Map<string, number>;
}

const NO_JOINS: DomainJoin[] = [];

export const useChannelJoins = (channelId: string | null): ChannelJoins => {
    const { join: joinRepository } = runtime.data.useRuntimeRepositories();
    const { userId } = runtime.session.useSessionIdentity();

    const [observed, setObserved] = useState<{ channelId: string | null; list: DomainJoin[] }>({
        channelId,
        list: NO_JOINS,
    });
    const joins = observed.channelId === channelId ? observed.list : NO_JOINS;

    useEffect(() => {
        if (!channelId) {
            setObserved({ channelId, list: NO_JOINS });
            return;
        }
        return joinRepository.observeList({ channelId, activeOnly: false }, result =>
            setObserved({ channelId, list: result?.list ?? NO_JOINS })
        );
    }, [joinRepository, channelId]);

    const myJoin = useMemo(
        () => (userId ? (joins.find(join => join.userId === userId) ?? null) : null),
        [joins, userId]
    );

    const activeMemberIds = useMemo(() => {
        const ids = new Set<string>();
        for (const join of joins) {
            if (join.userId && join.joined !== 0) ids.add(join.userId);
        }
        return [...ids];
    }, [joins]);

    const cursorByUser = useMemo(() => {
        const map = new Map<string, number>();
        for (const join of joins) {
            if (!join.userId) continue;
            map.set(join.userId, Math.max(join.readNo ?? 0, join.chatNo ?? 0));
        }
        return map;
    }, [joins]);

    return { joins, myJoin, activeMemberIds, cursorByUser };
};
