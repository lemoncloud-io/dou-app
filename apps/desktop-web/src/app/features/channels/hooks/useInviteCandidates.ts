import { useCallback, useEffect, useMemo, useState } from 'react';

import type { DomainUser } from '@chatic/data';
import { useRuntimeRepositories, useSocketState } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';

import { useChannels, useCurrentPlace } from '../../../shared';

export interface InviteCandidate extends DomainUser {
    /** Channel names (or ids) this candidate is already a member of — shown as context. */
    viaChannels: string[];
}

/**
 * People I can add to `targetChannelId`: every member of my *other* channels in the
 * active place, minus the target's current members and myself.
 *
 * There is no cloud-wide user directory on the server — `channel.list-user` is scoped
 * to one channel — so the pool is assembled client-side by loading each of my channels'
 * rosters and unioning them. The union is built from per-channel `cacheReadList({ channelId })`
 * reads rather than an unfiltered one: the user cache is a flat table that also holds chat
 * authors and profile lookups, so an unscoped read is not "members of my channels".
 *
 * `isVerified` decides whether the rosters are refreshed from the network or read straight from
 * the cache — the socket can sit unverified indefinitely after a sleep/wake wedge, and a picker
 * that waits it out shows a spinner forever. The cached pool is served either way, and the
 * network pass re-runs on the false→true edge.
 * Mount this only while the picker is open; it fans out one request per channel.
 */
export const useInviteCandidates = (targetChannelId: string | null) => {
    const { user: userRepository } = useRuntimeRepositories();
    const { isVerified } = useSocketState();
    const { userId: myUid } = useSessionIdentity();
    const { placeId } = useCurrentPlace();
    const { channels } = useChannels(placeId ?? undefined);

    const [candidates, setCandidates] = useState<InviteCandidate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    // useChannels re-derives `channels` on every new message, so nothing below may depend on the
    // array's identity. These string keys are the stable stand-ins the memos and the load
    // callback key on; the memos hand back the shapes the load actually wants.
    const channelKey = channels.map(c => c.id ?? '').join(',');
    // Names are keyed separately: renaming a channel leaves the id set untouched, so keying the
    // name map on channelKey alone would keep showing the old name under every candidate.
    const channelNameKey = channels.map(c => `${c.id ?? ''}\u0000${c.name ?? ''}`).join(',');
    const targetMemberKey = (channels.find(c => c.id === targetChannelId)?.memberIds ?? []).join(',');

    const myChannelIds = useMemo(() => channelKey.split(',').filter(Boolean), [channelKey]);
    const channelNameById = useMemo(
        () => new Map(channels.map(c => [c.id ?? '', c.name ?? c.id ?? ''])),
        [channelNameKey]
    );
    // Second exclusion source, independent of the roster read: the channel record's own member
    // list. Without it a failed (or not-yet-run) target roster fetch leaves the exclusion set
    // empty and the picker offers people who are already in the channel.
    const targetMemberIds = useMemo(() => targetMemberKey.split(',').filter(Boolean), [targetMemberKey]);

    // `fetch` false = cache-only pass. The socket can sit unverified indefinitely after a
    // sleep/wake wedge (see useChannels), and a picker that spins forever there is worse than
    // one showing the rosters already cached; the effect re-runs on the false→true edge.
    const load = useCallback(
        async (fetch: boolean): Promise<InviteCandidate[]> => {
            if (!targetChannelId) return [];
            const channelIds = myChannelIds.includes(targetChannelId)
                ? myChannelIds
                : [...myChannelIds, targetChannelId];

            // One roster per channel, all at once — order does not matter. A roster read hydrates
            // each member's read-state into the join cache, which is keyed `channelId@userId`, so
            // no channel can overwrite another's. A channel that fails (permissions, transport)
            // simply contributes nobody — a partial pool is more useful than an empty one.
            const results = fetch
                ? await Promise.allSettled(
                      channelIds.map(channelId => userRepository.refreshList({ channelId, detail: true }))
                  )
                : [];
            if (results.length > 0 && results.every(r => r.status === 'rejected')) {
                const { reason } = results[0] as PromiseRejectedResult;
                throw reason instanceof Error ? reason : new Error(String(reason));
            }

            const rosters = await Promise.all(
                channelIds.map(async channelId => ({
                    channelId,
                    users: (await userRepository.cacheReadList({ channelId }))?.list ?? [],
                }))
            );

            const excluded = new Set([
                ...(rosters.find(r => r.channelId === targetChannelId)?.users.map(u => u.id) ?? []),
                ...targetMemberIds,
            ]);

            const byId = new Map<string, InviteCandidate>();
            for (const { channelId, users } of rosters) {
                if (channelId === targetChannelId) continue;
                for (const user of users) {
                    if (!user.id || user.id === myUid || excluded.has(user.id)) continue;
                    const via = channelNameById.get(channelId) ?? channelId;
                    const existing = byId.get(user.id);
                    if (existing) existing.viaChannels.push(via);
                    else byId.set(user.id, { ...user, viaChannels: [via] });
                }
            }
            return [...byId.values()];
        },
        [userRepository, targetChannelId, myChannelIds, channelNameById, targetMemberIds, myUid]
    );

    useEffect(() => {
        if (!targetChannelId) return;
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
    }, [load, targetChannelId, isVerified]);

    return { candidates, isLoading, error };
};
