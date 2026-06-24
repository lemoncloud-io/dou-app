import { useEffect } from 'react';

import type { SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';

import { getDataManager, getRepositories } from '../../../data/runtime';
import { getSyncManager } from '../../runtime';

const buildKey = (target: SyncTargetDescriptor | null): string | null =>
    target ? `${target.type}:${target.id ?? ''}:${target.intervalMs ?? ''}` : null;

const normalizeJoinId = (joinId: string, channelId: string, uid: string): string => {
    if (joinId.includes('@')) return joinId;
    if (joinId === `${channelId}:${uid}`) return `${channelId}@${uid}`;
    return joinId;
};

/**
 * Registers a sync target for the component lifetime and unregisters on cleanup.
 * `register` returns its own dispose fn, so the effect cleanup maps onto it directly.
 * Re-runs only when the target key changes (type/id/interval).
 */
export const useSyncTarget = (target: SyncTargetDescriptor | null): void => {
    const key = buildKey(target);

    useEffect(() => {
        if (!target) return;
        return getSyncManager().register(target);
        // key captures every field we re-register on; target is read once per key.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
};

export const useChatSync = (channelId?: string, intervalMs?: number): void =>
    useSyncTarget(channelId ? { type: 'chat', id: channelId, ...(intervalMs ? { intervalMs } : {}) } : null);

export const useChannelSync = (channelId?: string, intervalMs?: number): void =>
    useSyncTarget(channelId ? { type: 'channel', id: channelId, ...(intervalMs ? { intervalMs } : {}) } : null);

export const usePlaceSync = (placeId?: string, intervalMs?: number): void =>
    useSyncTarget(placeId ? { type: 'place', id: placeId, ...(intervalMs ? { intervalMs } : {}) } : null);

export const useProfileSync = (profileId?: string, intervalMs?: number): void =>
    useSyncTarget(profileId ? { type: 'profile', id: profileId, ...(intervalMs ? { intervalMs } : {}) } : null);

/**
 * Locates the current user's own join for a channel. The join cache is keyed per
 * channel and may hold other members, so we match on `userId === uid`.
 */
const findMyJoinId = async (
    repos: ReturnType<typeof getRepositories>,
    channelId: string,
    uid: string
): Promise<string | null> => {
    const result = await repos.join.cacheReadList({ channelId, activeOnly: false });
    const mine = (result?.list ?? []).find(item => item.userId === uid);
    return mine?.id ?? null;
};

/**
 * Resolves the joinId the sync target needs from a channelId. The page only knows the
 * channel, so we read our own join from cache; if the cache is cold we warm it once via
 * refreshList, then fall back to the canonical composite id the read path also uses
 * (`${channelId}@${uid}`, see JoinRepositoryV2.readChat).
 */
const resolveMyJoinId = async (channelId: string): Promise<string> => {
    const repos = getRepositories();
    const uid = String(getDataManager().getContext().uid ?? '');

    const cached = await findMyJoinId(repos, channelId, uid);
    if (cached) return normalizeJoinId(cached, channelId, uid);

    try {
        await repos.join.refreshList({ channelId });
    } catch {
        // discovery is best-effort; fall through to the composite fallback below
    }
    const warmed = await findMyJoinId(repos, channelId, uid);
    return warmed ? normalizeJoinId(warmed, channelId, uid) : `${channelId}@${uid || 'me'}`;
};

/**
 * Registers the current user's join (read-state) sync for a channel. Unlike the other
 * hooks, joinId is not known to the caller and must be resolved asynchronously, so this
 * cannot delegate to useSyncTarget. Re-resolves and re-registers when the channel changes.
 */
export const useJoinSync = (channelId?: string): void => {
    useEffect(() => {
        if (!channelId) return;
        let disposed = false;
        let dispose: (() => void) | null = null;

        void resolveMyJoinId(channelId).then(joinId => {
            // The channel may have changed (or unmounted) while resolving — drop the result.
            if (disposed) return;
            dispose = getSyncManager().registerJoin(joinId);
        });

        return () => {
            disposed = true;
            dispose?.();
        };
    }, [channelId]);
};
