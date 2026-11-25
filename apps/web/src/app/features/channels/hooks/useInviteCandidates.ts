import { useEffect, useMemo, useState } from 'react';

import { useIsMutating } from '@tanstack/react-query';

import { runtime, type DomainChannel, type DomainPlaceMember } from '@chatic/runtime-react';

import { useHomeChannels, useSelectedCloudId } from '../../../hooks';

export interface UseInviteCandidatesResult {
    candidateIds: string[];
    memberById: Map<string, DomainPlaceMember>;
    fromPlaceList: boolean;
    isLoading: boolean;
}

interface PlaceListState {
    key: string;
    members: DomainPlaceMember[] | null;
    targetRosterIds: string[];
}

const EMPTY_MEMBERS = new Map<string, DomainPlaceMember>();

export const useInviteCandidates = (channelId: string | null, sid: string | null): UseInviteCandidatesResult => {
    const { userId } = runtime.session.useSessionIdentity();
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const cid = useSelectedCloudId();
    const myUid = runtime.session.useUidInCloud(cid);
    const isVerified = runtime.connection.useCloudVerified(cid);
    const { user: userRepository } = runtime.data.useRuntimeRepositories();
    const { channels, isLoading: channelsLoading } = useHomeChannels(sid);
    const isSwitching =
        useIsMutating({ mutationKey: runtime.session.SWITCH_SITE_MUTATION_KEY }) +
            useIsMutating({ mutationKey: runtime.session.SWITCH_CLOUD_MUTATION_KEY }) >
        0;
    const sessionPlaceId = isSwitching ? null : selectedSiteId;

    const target = channels.find(channel => channel.id === channelId);
    const targetMemberKey = (target?.memberIds ?? []).join(',');

    const rosterIds = useMemo(() => {
        if (!channelId || !sid) return [];

        const excluded = new Set<string>(target?.memberIds ?? []);
        if (userId) excluded.add(userId);
        if (myUid) excluded.add(myUid);

        const pool = new Set<string>();
        channels.forEach((channel: DomainChannel) => {
            if (channel.id === channelId) return;
            channel.memberIds?.forEach(memberId => {
                if (memberId && !excluded.has(memberId)) pool.add(memberId);
            });
        });

        return Array.from(pool);
    }, [channels, target, channelId, sid, userId, myUid]);

    const placeKey = channelId && sid ? `${cid}|${sid}|${channelId}` : '';
    const [placeList, setPlaceList] = useState<PlaceListState | null>(null);

    useEffect(() => {
        if (!placeKey || !sid || !channelId || !isVerified) return;
        let cancelled = false;
        void (async () => {
            const members = await userRepository
                .listPlaceMembers({ placeId: sid, sessionPlaceId })
                .then(result => (result.context.cid === cid ? result.members : null))
                .catch(() => null);
            const roster = members ? await userRepository.cacheReadList({ channelId }).catch(() => null) : null;
            if (cancelled) return;
            setPlaceList({
                key: placeKey,
                members,
                targetRosterIds: (roster?.list ?? []).map(user => user.id).filter(Boolean),
            });
        })();
        return () => {
            cancelled = true;
        };
    }, [userRepository, placeKey, sid, channelId, cid, sessionPlaceId, isVerified]);

    const settled = placeList?.key === placeKey ? placeList : null;
    const placeMembers = isVerified && settled?.members ? settled.members : null;

    const fromPlace = useMemo(() => {
        if (!placeMembers) return null;
        const excluded = new Set<string>([
            ...targetMemberKey.split(',').filter(Boolean),
            ...(settled?.targetRosterIds ?? []),
        ]);
        if (userId) excluded.add(userId);
        if (myUid) excluded.add(myUid);
        const kept = placeMembers.filter(member => member.id && !excluded.has(member.id));
        return { candidateIds: kept.map(member => member.id), memberById: new Map(kept.map(m => [m.id, m])) };
    }, [placeMembers, settled, targetMemberKey, userId, myUid]);

    if (fromPlace && !channelsLoading) return { ...fromPlace, fromPlaceList: true, isLoading: false };
    if (fromPlace) return { candidateIds: [], memberById: EMPTY_MEMBERS, fromPlaceList: true, isLoading: true };
    const awaitingList = isVerified && !!placeKey && !settled;
    return {
        candidateIds: awaitingList ? [] : rosterIds,
        memberById: EMPTY_MEMBERS,
        fromPlaceList: false,
        isLoading: awaitingList || channelsLoading,
    };
};
