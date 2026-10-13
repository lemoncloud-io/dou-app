import { useEffect, useMemo, useState } from 'react';

import { useIsMutating } from '@tanstack/react-query';

import { runtime } from '@chatic/app-runtime';
import type { DomainChannel, DomainPlaceMember } from '@chatic/data';

import { useHomeChannels, useSelectedCloudId } from '../../../hooks';

export interface UseInviteCandidatesResult {
    /** User ids that may be added to the target channel. */
    candidateIds: string[];
    /**
     * The place members by id, when the pool came from the place member list — the user's own name
     * and picture, for a person the user cache has never seen. Empty when the pool is the fallback.
     */
    memberById: Map<string, DomainPlaceMember>;
    /**
     * True when the pool is the place list. Its profiles were loaded with it, a page at a time, so
     * the caller must not bootstrap and poll them one person at a time — that is one request per
     * member of the place.
     */
    fromPlaceList: boolean;
    isLoading: boolean;
}

/** What one place-list load settled on. `members` null = the list could not be had; use the fallback. */
interface PlaceListState {
    key: string;
    members: DomainPlaceMember[] | null;
    /** The target channel's roster as the user cache holds it — the second exclusion source. */
    targetRosterIds: string[];
}

const EMPTY_MEMBERS = new Map<string, DomainPlaceMember>();

/**
 * People the owner can add to `channelId`: the members of the channel's place, minus the target's
 * current members and myself.
 *
 * The members come from `place.list-user` (`userRepository.listPlaceMembers`), so somebody with no
 * channel at all — invited into the place only, or not yet past accepting — and somebody who shares
 * no channel with me are offered too. That read also loads their place profiles into the profile
 * cache when the session is on this place, which is where the tab takes names and pictures from.
 *
 * The target's members are excluded from two independent sources: the channel row's `memberIds`
 * and the target's roster in the user cache. Either alone covers the happy path; both together mean
 * a row that arrived without `memberIds` cannot offer somebody already there.
 *
 * The fallback is the previous pool: the union of my OTHER channels' `memberIds`, a pure derivation
 * over `useHomeChannels` (a slice of the app's single cloud-wide channel observation) that issues no
 * requests. It is used when the list fails — 403 for a non-member, or a cloud whose server has not
 * shipped the action — and while the socket is not verified, so a wedged connection still shows the
 * people the cache knows. It holds only people I share a room with, so it never shows anyone I would
 * not be allowed to see. The two pools are never mixed.
 *
 * Returns ids, plus the listed members for the name chain. Names and avatars are the caller's job —
 * they come from the place profile cache first, not from the channel rows, so a person picked here
 * reads the same as in the room's member list.
 */
export const useInviteCandidates = (channelId: string | null, sid: string | null): UseInviteCandidatesResult => {
    const { userId } = runtime.session.useSessionIdentity();
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const cid = useSelectedCloudId();
    // "Me" is my id in this cloud, which is what the place list names me by; the session id is
    // left out as well, in case the two differ.
    const myUid = runtime.session.useUidInCloud(cid);
    const isVerified = runtime.connection.useCloudVerified(cid);
    const { user: userRepository } = runtime.data.useRuntimeRepositories();
    const { channels, isLoading: channelsLoading } = useHomeChannels(sid);
    // Mid-switch the socket session may still be on the outgoing place, so no place is vouched for
    // and the list loads without profiles (see `listPlaceMembers`).
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
            // A row that came in without the roster (the field is optional and only the
            // `detail: true` paths fill it) contributes nothing rather than guessing.
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
                // An answer asked for in another cloud (the repository moved while it ran) is not this pool.
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

    // The target's `memberIds` come with the channel rows, so a list that lands before them would
    // offer people already in the room: hold it until the rows are in.
    if (fromPlace && !channelsLoading) return { ...fromPlace, fromPlaceList: true, isLoading: false };
    if (fromPlace) return { candidateIds: [], memberById: EMPTY_MEMBERS, fromPlaceList: true, isLoading: true };
    // Verified but the list has not settled yet: wait for it rather than flash the fallback pool.
    const awaitingList = isVerified && !!placeKey && !settled;
    return {
        candidateIds: awaitingList ? [] : rosterIds,
        memberById: EMPTY_MEMBERS,
        fromPlaceList: false,
        isLoading: awaitingList || channelsLoading,
    };
};
