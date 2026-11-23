import { useCallback, useEffect, useMemo, useState } from 'react';

import { useIsMutating } from '@tanstack/react-query';

import { RELAY_CLOUD_ID, type DomainChannel, type DomainUser, runtime } from '@chatic/runtime';

import { isDmChannel, isSelfChannel, useChannels, useCurrentPlace } from '../../../shared';

export interface InviteCandidate extends DomainUser {
    viaChannels: string[];
}

interface InviteCandidatesOptions {
    enabled?: boolean;
}

const viaLabelOf = (channel: DomainChannel): string =>
    isDmChannel(channel) || isSelfChannel(channel) ? '' : (channel.name ?? channel.id ?? '');

export const useInviteCandidates = (
    targetChannelId: string | null,
    { enabled = targetChannelId !== null }: InviteCandidatesOptions = {}
) => {
    const { user: userRepository } = runtime.data.useRuntimeRepositories();
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const { userId: sessionUid } = runtime.session.useSessionIdentity();
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const myUid = runtime.session.useUidInCloud(selectedCloudId) ?? sessionUid;
    const { placeId } = useCurrentPlace();
    const { channels } = useChannels(placeId ?? undefined);
    const isSwitching =
        useIsMutating({ mutationKey: runtime.session.SWITCH_SITE_MUTATION_KEY }) +
            useIsMutating({ mutationKey: runtime.session.SWITCH_CLOUD_MUTATION_KEY }) >
        0;

    const [candidates, setCandidates] = useState<InviteCandidate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const channelKey = channels.map(c => c.id ?? '').join(',');
    const channelNameKey = channels.map(c => `${c.id ?? ''}\u0000${viaLabelOf(c)}`).join(',');
    const targetMemberKey = (channels.find(c => c.id === targetChannelId)?.memberIds ?? []).join(',');

    const myChannelIds = useMemo(() => channelKey.split(',').filter(Boolean), [channelKey]);
    const personalRoomKey = channels
        .filter(c => isDmChannel(c) || isSelfChannel(c))
        .map(c => c.id ?? '')
        .join(',');
    const personalRoomIds = useMemo(() => new Set(personalRoomKey.split(',').filter(Boolean)), [personalRoomKey]);
    const channelNameById = useMemo(() => new Map(channels.map(c => [c.id ?? '', viaLabelOf(c)])), [channelNameKey]);
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

    const loadPlaceMembers = useCallback(async (): Promise<{
        members: InviteCandidate[] | null;
        refreshedTarget: boolean;
    }> => {
        if (!placeId) return { members: null, refreshedTarget: false };
        const [listed, targetRefresh] = await Promise.allSettled([
            userRepository.listPlaceMembers({ placeId, sessionPlaceId: isSwitching ? null : placeId }),
            targetChannelId ? userRepository.refreshList({ channelId: targetChannelId, detail: true }) : null,
        ]);
        const refreshedTarget = !!targetChannelId && targetRefresh.status === 'fulfilled';
        if (listed.status === 'rejected') return { members: null, refreshedTarget };
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

    const load = useCallback(
        async (fetch: boolean): Promise<InviteCandidate[]> => {
            if (!enabled) return [];
            let refreshedTarget = false;
            if (fetch) {
                const placed = await loadPlaceMembers();
                if (placed.members) return placed.members;
                refreshedTarget = placed.refreshedTarget;
            }

            const channelIds =
                !targetChannelId || myChannelIds.includes(targetChannelId)
                    ? myChannelIds
                    : [...myChannelIds, targetChannelId];

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
