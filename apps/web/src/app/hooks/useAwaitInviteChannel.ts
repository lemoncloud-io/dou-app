import { useCallback } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useGlobalSession, useSessionSelection } from '@chatic/app-runtime';
import type { DomainChannel } from '@chatic/data';

/** Give up after this long and let the caller fall back (home + a "it's on its way" notice). */
export const CHANNEL_WAIT_TIMEOUT_MS = 20_000;
/** How often to pull a channel delta while waiting. */
const CHANNEL_WAIT_POLL_MS = 3_000;

export interface AwaitInviteChannelOptions {
    /**
     * Channel ids that already existed, so a match is genuinely new. Defaults to whatever is in the
     * cache when the wait starts — pass this when the caller snapshotted earlier (e.g. before the
     * accept round-trip).
     */
    knownChannelIds?: Iterable<string>;
    timeoutMs?: number;
    pollMs?: number;
}

/**
 * Waits for the DM room an accepted invite creates.
 *
 * `invite.accept` answers without a `channelId` — the room is built asynchronously and only shows up
 * once the client sees it (05-client-guide §미구현, backend request 5). Two things follow:
 *
 * - Socket push cannot deliver it. `ChannelSyncPlan` only fires for targets already registered by a
 *   rendered row, and a room nobody has seen has no row.
 * - The background poll would, but its cadence is 60s — far too slow to hold a user on a spinner.
 *
 * So this pulls `channel.sync` deltas on a short interval and watches the cache for a new `dm`
 * channel to land. It resolves with that channel id, or `null` on timeout — it never rejects, because
 * the accept itself already succeeded and the caller's fallback (send them home, tell them the room
 * is coming) is a fine outcome.
 *
 * The delta watermark follows the same protocol as useBackgroundSync (`channel-sync:<cid>` through
 * syncMeta), so borrowing the cursor here does not make the periodic sync skip anything.
 *
 * Shared with the inviter side (roadmap Track B — the invite waiting screen makes the same jump when
 * it sees `state === 'accepted'`).
 */
export const useAwaitInviteChannel = () => {
    const { channel, syncMeta } = useRuntimeRepositories();
    const session = useGlobalSession();
    const { selectedSiteId: sid } = useSessionSelection();
    // Same derivation as useHomeChannels — the observer scope key has to match the one the home list
    // subscribes with, or the two see different cache partitions.
    const uid = session.identity.userId ?? undefined;
    const cid = session.cloud?.cloudId && session.cloud.cloudId !== 'default' ? session.cloud.cloudId : 'default';

    const awaitChannel = useCallback(
        async ({
            knownChannelIds,
            timeoutMs = CHANNEL_WAIT_TIMEOUT_MS,
            pollMs = CHANNEL_WAIT_POLL_MS,
        }: AwaitInviteChannelOptions = {}): Promise<string | null> => {
            // No active place means nothing to observe; the caller falls back rather than hanging.
            if (!sid) return null;

            const known = new Set(knownChannelIds ?? []);
            if (!knownChannelIds) {
                const before = await channel.cacheReadList({ sid });
                for (const item of before?.list ?? []) if (item.id) known.add(item.id);
            }

            // The cache read on the relay server is not sid-isolated, so filter like useHomeChannels.
            const findNewDm = (list: DomainChannel[]): string | undefined =>
                list.find(item => !!item.id && !known.has(item.id) && item.sid === sid && item.stereo === 'dm')?.id;

            return new Promise<string | null>(resolve => {
                let settled = false;
                let unsubscribe: (() => void) | null = null;
                const finish = (channelId: string | null) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    clearInterval(ticker);
                    unsubscribe?.();
                    resolve(channelId);
                };

                const timer = setTimeout(() => finish(null), timeoutMs);

                // Force discovery rather than waiting out the 60s background cadence.
                const pull = async () => {
                    try {
                        const kind = `channel-sync:${cid}`;
                        const since = await syncMeta.getSyncedAt(kind);
                        const { syncedAt } = await channel.syncChannels(since);
                        await syncMeta.setSyncedAt(kind, syncedAt);
                    } catch {
                        // best-effort: a failed pull just means the next tick tries the same cursor
                    }
                };
                const ticker = setInterval(() => void pull(), pollMs);
                void pull();

                // SCOPE PINNING — key the observer off the React session, matching useHomeChannels;
                // without it a cloud switch registers under the stale provider cid and misses writes.
                unsubscribe = channel.observeList(
                    { sid },
                    result => {
                        const found = findNewDm(result?.list ?? []);
                        if (found) finish(found);
                    },
                    { cid, uid }
                );
                // observeList may resolve synchronously and call finish() before the assignment above
                // lands, which would leave the subscription open. Settle it here in that case.
                if (settled) {
                    unsubscribe();
                    unsubscribe = null;
                }
            });
        },
        [channel, syncMeta, cid, uid, sid]
    );

    return { awaitChannel };
};
