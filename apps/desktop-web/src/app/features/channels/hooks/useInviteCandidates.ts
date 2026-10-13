import { useCallback, useEffect, useMemo, useState } from 'react';

import { useIsMutating } from '@tanstack/react-query';

import { RELAY_CLOUD_ID, type DomainChannel, type DomainUser } from '@chatic/data';
import { runtime } from '@chatic/app-runtime';

import { isDmChannel, isSelfChannel, useChannels, useCurrentPlace } from '../../../shared';

export interface InviteCandidate extends DomainUser {
    /** Channel names (or ids) this candidate is already a member of — shown as context. */
    viaChannels: string[];
}

interface InviteCandidatesOptions {
    /**
     * Load the pool. Defaults to "a target is set", which is how the add-members picker says it
     * is open. A picker with no target channel (starting a 1:1) turns it on explicitly.
     */
    enabled?: boolean;
}

// The label a candidate's "via" context shows for a channel, or '' for none. A 1:1 or a
// notes-to-self room usually has no name, and its fallback would be a raw channel id; the
// person is still offered, just without that room as context.
const viaLabelOf = (channel: DomainChannel): string =>
    isDmChannel(channel) || isSelfChannel(channel) ? '' : (channel.name ?? channel.id ?? '');

/**
 * People I can add to `targetChannelId`: the members of the active place, minus the target's
 * current members and myself. With no target (a picker that opens a 1:1 rather than adding to a
 * room) it is every member of the place, minus myself.
 *
 * The members come from `place.list-user` (`userRepository.listPlaceMembers`), so somebody with no
 * channel at all — invited into the place only, or not yet past accepting — and somebody who
 * shares no channel with me are offered too. That read also loads their place profiles into the
 * profile cache, which is where the pickers take names and pictures from.
 *
 * The target's members are excluded from two independent sources: the channel record's own
 * `memberIds`, and the target's roster. Either alone covers the happy path; both together mean a
 * record without `memberIds`, or a roster read that failed, cannot offer someone already there.
 * `viaChannels` is worked out from the rosters already in the cache — nothing is fetched for it —
 * so a member who shares no channel with me simply has none.
 *
 * When the member list fails (the server answers 403 to a non-member, and a cloud whose server has
 * not shipped the action fails it outright), the pool falls back to the previous one: the union of
 * my own channels' rosters, loaded one request per channel. That holds only people I already share
 * a room with, so the fallback can never show anyone I would not be allowed to see. The two are
 * never mixed — the place list stands alone, or the fallback does.
 *
 * `isVerified` decides whether anything is fetched at all — the socket can sit unverified
 * indefinitely after a sleep/wake wedge, and a picker that waits it out shows a spinner forever.
 * Unverified, the cached rosters are served; the network pass re-runs on the false→true edge.
 * Mount this only while the picker is open.
 */
export const useInviteCandidates = (
    targetChannelId: string | null,
    { enabled = targetChannelId !== null }: InviteCandidatesOptions = {}
) => {
    const { user: userRepository } = runtime.data.useRuntimeRepositories();
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const { userId: sessionUid } = runtime.session.useSessionIdentity();
    const { selectedCloudId } = runtime.session.useSessionSelection();
    // "Me" is my id in this cloud, which is what the place list and its profiles name me by. The
    // session id is left out too, in case the two differ.
    const myUid = runtime.session.useUidInCloud(selectedCloudId) ?? sessionUid;
    const { placeId } = useCurrentPlace();
    const { channels } = useChannels(placeId ?? undefined);
    // Mid-switch the socket session may still be on the outgoing place, so no place is vouched for
    // and the member list loads without profiles (see `listPlaceMembers`).
    const isSwitching =
        useIsMutating({ mutationKey: runtime.session.SWITCH_SITE_MUTATION_KEY }) +
            useIsMutating({ mutationKey: runtime.session.SWITCH_CLOUD_MUTATION_KEY }) >
        0;

    const [candidates, setCandidates] = useState<InviteCandidate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    // useChannels re-derives `channels` on every new message, so nothing below may depend on the
    // array's identity. These string keys are the stable stand-ins the memos and the load
    // callback key on; the memos hand back the shapes the load actually wants.
    const channelKey = channels.map(c => c.id ?? '').join(',');
    // Names are keyed separately: renaming a channel leaves the id set untouched, so keying the
    // name map on channelKey alone would keep showing the old name under every candidate.
    const channelNameKey = channels.map(c => `${c.id ?? ''}\u0000${viaLabelOf(c)}`).join(',');
    const targetMemberKey = (channels.find(c => c.id === targetChannelId)?.memberIds ?? []).join(',');

    const myChannelIds = useMemo(() => channelKey.split(',').filter(Boolean), [channelKey]);
    const personalRoomKey = channels
        .filter(c => isDmChannel(c) || isSelfChannel(c))
        .map(c => c.id ?? '')
        .join(',');
    const personalRoomIds = useMemo(() => new Set(personalRoomKey.split(',').filter(Boolean)), [personalRoomKey]);
    const channelNameById = useMemo(() => new Map(channels.map(c => [c.id ?? '', viaLabelOf(c)])), [channelNameKey]);
    // Second exclusion source, independent of the roster read: the channel record's own member
    // list. Without it a failed (or not-yet-run) target roster fetch leaves the exclusion set
    // empty and the picker offers people who are already in the channel.
    const targetMemberIds = useMemo(() => targetMemberKey.split(',').filter(Boolean), [targetMemberKey]);

    const readRosters = useCallback(
        (channelIds: string[]) =>
            Promise.all(
                channelIds.map(async channelId => ({
                    channelId,
                    users: (await userRepository.cacheReadList({ channelId }))?.list ?? [],
                }))
            ),
        [userRepository]
    );

    // The place's members as the pool. `members` null when the list cannot be had, which is the
    // caller's cue to fall back to the roster union; `refreshedTarget` says the target roster was
    // already refreshed, so the fallback does not ask again.
    const loadPlaceMembers = useCallback(async (): Promise<{
        members: InviteCandidate[] | null;
        refreshedTarget: boolean;
    }> => {
        if (!placeId) return { members: null, refreshedTarget: false };
        // The target roster is refreshed alongside the list: it is the second exclusion source, and
        // a member list that reaches the picker before it would offer people already in the room.
        const [listed, targetRefresh] = await Promise.allSettled([
            userRepository.listPlaceMembers({ placeId, sessionPlaceId: isSwitching ? null : placeId }),
            targetChannelId ? userRepository.refreshList({ channelId: targetChannelId, detail: true }) : null,
        ]);
        // Only a refresh that worked spares the fallback its own; a failed one is asked again there.
        const refreshedTarget = !!targetChannelId && targetRefresh.status === 'fulfilled';
        if (listed.status === 'rejected') return { members: null, refreshedTarget };
        // An answer asked for in another cloud (the repository moved while it ran) is not this pool.
        // Named the way the repository names it: no cloud is the relay.
        if (listed.value.context.cid !== (selectedCloudId || RELAY_CLOUD_ID)) return { members: null, refreshedTarget };

        const rosters = await readRosters(
            targetChannelId && !myChannelIds.includes(targetChannelId)
                ? [...myChannelIds, targetChannelId]
                : myChannelIds
        );
        const excluded = new Set([
            ...(rosters.find(r => r.channelId === targetChannelId)?.users.map(u => u.id) ?? []),
            ...targetMemberIds,
        ]);
        const viaById = new Map<string, string[]>();
        for (const { channelId, users } of rosters) {
            if (channelId === targetChannelId) continue;
            const label = channelNameById.get(channelId) ?? channelId;
            if (!label) continue;
            for (const user of users) {
                if (user.id) viaById.set(user.id, [...(viaById.get(user.id) ?? []), label]);
            }
        }

        const members = listed.value.members
            .filter(member => member.id && member.id !== myUid && member.id !== sessionUid && !excluded.has(member.id))
            .map(({ isOwner: _isOwner, ...member }) => ({ ...member, viaChannels: viaById.get(member.id) ?? [] }));
        return { members, refreshedTarget };
    }, [
        userRepository,
        placeId,
        isSwitching,
        selectedCloudId,
        targetChannelId,
        myChannelIds,
        readRosters,
        targetMemberIds,
        channelNameById,
        myUid,
        sessionUid,
    ]);

    // `fetch` false = cache-only pass. The socket can sit unverified indefinitely after a
    // sleep/wake wedge (see useChannels), and a picker that spins forever there is worse than
    // one showing the rosters already cached; the effect re-runs on the false→true edge.
    const load = useCallback(
        async (fetch: boolean): Promise<InviteCandidate[]> => {
            if (!enabled) return [];
            let refreshedTarget = false;
            if (fetch) {
                const placed = await loadPlaceMembers();
                if (placed.members) return placed.members;
                refreshedTarget = placed.refreshedTarget;
            }

            // Fallback: the union of my channels' rosters.
            const channelIds =
                !targetChannelId || myChannelIds.includes(targetChannelId)
                    ? myChannelIds
                    : [...myChannelIds, targetChannelId];

            // One roster per channel, all at once — order does not matter. A roster read hydrates
            // each member's read-state into the join cache, which is keyed `channelId@userId`, so
            // no channel can overwrite another's. A channel that fails (permissions, transport)
            // simply contributes nobody — a partial pool is more useful than an empty one.
            // 1:1 and self rooms are read from the cache only: their one other member is someone I
            // already talk to, and the sidebar loads that roster when it names the row.
            const fetchIds = channelIds.filter(id =>
                id === targetChannelId ? !refreshedTarget : !personalRoomIds.has(id)
            );
            const results = fetch
                ? await Promise.allSettled(
                      fetchIds.map(channelId => userRepository.refreshList({ channelId, detail: true }))
                  )
                : [];
            if (results.length > 0 && results.every(r => r.status === 'rejected')) {
                const { reason } = results[0] as PromiseRejectedResult;
                throw reason instanceof Error ? reason : new Error(String(reason));
            }

            const rosters = await readRosters(channelIds);

            const excluded = new Set([
                ...(rosters.find(r => r.channelId === targetChannelId)?.users.map(u => u.id) ?? []),
                ...targetMemberIds,
            ]);

            const byId = new Map<string, InviteCandidate>();
            for (const { channelId, users } of rosters) {
                if (channelId === targetChannelId) continue;
                for (const user of users) {
                    if (!user.id || user.id === myUid || user.id === sessionUid || excluded.has(user.id)) continue;
                    const label = channelNameById.get(channelId) ?? channelId;
                    const via = label ? [label] : [];
                    const existing = byId.get(user.id);
                    if (existing) existing.viaChannels.push(...via);
                    else byId.set(user.id, { ...user, viaChannels: via });
                }
            }
            return [...byId.values()];
        },
        [
            userRepository,
            enabled,
            loadPlaceMembers,
            readRosters,
            targetChannelId,
            myChannelIds,
            personalRoomIds,
            channelNameById,
            targetMemberIds,
            myUid,
            sessionUid,
        ]
    );

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        setIsLoading(true);
        setError(null);
        load(isVerified)
            .then(list => {
                if (!cancelled) setCandidates(list);
            })
            .catch((err: unknown) => {
                if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [load, enabled, isVerified]);

    return { candidates, isLoading, error };
};
