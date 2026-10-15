import { useCallback, useEffect, useRef } from 'react';

import { runtime } from '@chatic/app-runtime';

import { useAwaitInviteChannel, useRelayInviteMutations } from '../../../../hooks';

/**
 * Delays before each tier-2 `invite.get` probe, applied before the probe it precedes.
 *
 * The first is 0: `InviteModel.channelId` is documented as "the dm room created by acceptance", and a
 * re-invite reuses an existing room (05-client-guide §Constraints), so the field can already be filled
 * by the time we ask. The second covers a room that lands a moment later.
 *
 * Kept to two on purpose. Tier 3 watches actual channel rows and is the more robust mechanism, but it
 * only starts once probing gives up — so every extra probe both delays the answer and postpones the
 * better path. Two costs 1.5s in the worst case; a third at +4s would buy little that tier 3's own 3s
 * polling does not already cover.
 */
export const CHANNEL_PROBE_DELAYS_MS = [0, 1_500];

/**
 * How long, from the start of the hunt, the room's push is still waited for once the tiers have given
 * up. With no active place tier 3 gives up at once, so the tiers end about 1.6 s after the accept —
 * only 0.7 s after the push arrived on the dev server. Five seconds leaves room for a slower server
 * without holding the spinner much past what tier 2 alone already costs.
 */
export const ROOM_PUSH_WAIT_MS = 5_000;

/** Which way the room was found — `none` when it was not. */
export type InviteChannelSource = 'response' | 'push' | 'probe' | 'list' | 'none';

/** The fields of a `join.sync` push this flow reads. */
interface JoinPush {
    channelId?: string;
    userId?: string;
}

/**
 * Whether a relay `join.sync` push is the inviter's join to the 1:1 room this accept created.
 *
 * The server builds the room after `invite.accept` answers and pushes the inviter's join row to the
 * accepting side about a second later (measured on the dev server). Both conditions are needed: the
 * inviter can be joined to other rooms the reader shares, and a 1:1 room's id is its two members'
 * ids joined by `@`.
 */
export const isInviterJoinToNewRoom = (
    join: JoinPush | null | undefined,
    inviterId: string
): join is { channelId: string } =>
    !!join?.channelId && join.userId === inviterId && join.channelId.split('@').includes(inviterId);

export interface ResolveInviteChannelOptions {
    /** Tier 1: the `channelId` the `invite.accept` response carried, when it carried one. */
    acceptedChannelId?: string;
    /**
     * Who sent the invite. With it, the room's own `join.sync` push is watched alongside tiers 2 and
     * 3, and whichever finds the room first wins; without it only the tiers run.
     */
    inviterId?: string;
    /** Told which way the room was found, for the accept trace. */
    onResolved?: (source: InviteChannelSource) => void;
    /** Tier 2 cadence. Exposed so tests can shrink it, like `awaitChannel`'s timeoutMs/pollMs. */
    probeDelaysMs?: number[];
    /** Tier 3: forwarded verbatim to the channel-list watch. */
    knownChannelIds?: Iterable<string>;
    timeoutMs?: number;
    pollMs?: number;
}

const sleep = (ms: number): Promise<void> =>
    new Promise(resolve => {
        setTimeout(resolve, ms);
    });

/**
 * Resolves the DM room an accepted relay invite creates, in three tiers (ADR-0035).
 *
 * The room is created asynchronously — "an invite creates only the code; the room is created the
 * moment it's accepted" — so whether `invite.accept` answers with the id depends on how far the
 * backend has got (05-client-guide §Not Implemented). Rather than assume, this reads the value if it
 * is already there and only then falls back to the slower, broader mechanisms. The guide names both
 * fallbacks: "wait for the channel list to refresh, or query it again".
 *
 * 1. the accept response's `channelId` (no wait at all)
 * 2. `invite.get` probes on {@link CHANNEL_PROBE_DELAYS_MS}
 * 3. `useAwaitInviteChannel` — watch the channel list for a new `dm` row
 *
 * Alongside 2 and 3, the room's `join.sync` push (see {@link isInviterJoinToNewRoom}). On the dev
 * server the probes never saw `channelId` filled — the invite view does not carry it — so every room
 * was found by tier 3's first pull, 1.5 s or more after the accept, and with no active place tier 3
 * gives up at once. The push names the room about a second after the accept, whatever the place.
 *
 * Follows `useAwaitInviteChannel`'s contract: **never rejects.** Unresolved is `null`, which the caller
 * turns into a "the room is on its way" notice. Tier-2 errors are swallowed for the same reason — the
 * accept already succeeded, so a failed probe is not the user's problem.
 */
export const useResolveInviteChannel = () => {
    const { awaitChannel } = useAwaitInviteChannel();
    const { getInvite } = useRelayInviteMutations();

    // Latest-value ref: the probe loop reads these long after the closure was built, and keeping them
    // out of the deps stops `resolveChannel` from churning identity on every render.
    const latest = useRef({ awaitChannel, getInvite });
    latest.current = { awaitChannel, getInvite };

    // Stop probing once the caller is gone. Its generation guard is the real defence, but there is no
    // reason to keep spending socket round-trips after an unmount mid-delay.
    const aliveRef = useRef(true);
    useEffect(() => {
        aliveRef.current = true;
        return () => {
            aliveRef.current = false;
        };
    }, []);

    const resolveChannel = useCallback(
        async (code: string, options: ResolveInviteChannelOptions = {}): Promise<string | null> => {
            const {
                acceptedChannelId,
                inviterId,
                onResolved,
                probeDelaysMs = CHANNEL_PROBE_DELAYS_MS,
                knownChannelIds,
                timeoutMs,
                pollMs,
            } = options;

            // Tier 1 — already in hand.
            if (acceptedChannelId) {
                onResolved?.('response');
                return acceptedChannelId;
            }

            const startedAt = Date.now();
            // Set once a winner is known, so the probe loop stops instead of going on into tier 3.
            let settled = false;
            // Stops tier 3's polling once the room is found another way or the hunt is over.
            const tierThree = new AbortController();
            const none = { channelId: null, source: 'none' as InviteChannelSource };

            const viaTiers = async (): Promise<{ channelId: string | null; source: InviteChannelSource }> => {
                // Tier 2 — re-read the invite; `channelId` fills in once the room exists.
                for (const delayMs of probeDelaysMs) {
                    if (delayMs > 0) await sleep(delayMs);
                    if (!aliveRef.current || settled) return { channelId: null, source: 'none' };
                    try {
                        // Only `channelId` is read. The probe deliberately ignores `state` — this runs after
                        // a successful accept, so `state` is `accepted` and must not be mistaken for the
                        // "already joined" case the entry read uses it for.
                        const probed = await latest.current.getInvite(code);
                        if (!aliveRef.current) return { channelId: null, source: 'none' };
                        if (probed?.channelId) return { channelId: probed.channelId, source: 'probe' };
                    } catch {
                        // Best-effort: drop this tier and let the list watch below try.
                        if (!aliveRef.current) return { channelId: null, source: 'none' };
                    }
                }
                if (settled) return { channelId: null, source: 'none' };

                // Tier 3 — watch the channel list (the original, invite-agnostic path).
                const listed = await latest.current.awaitChannel({
                    knownChannelIds,
                    timeoutMs,
                    pollMs,
                    signal: tierThree.signal,
                });
                return { channelId: listed, source: listed ? 'list' : 'none' };
            };

            let stopWatching = (): void => undefined;
            const viaPush = new Promise<{ channelId: string; source: InviteChannelSource }>(resolve => {
                if (!inviterId) return;
                stopWatching = runtime.connection
                    .getSocketManager()
                    .getScopedClient(runtime.connection.RELAY_SLOT)
                    .onType<JoinPush>('join.sync', message => {
                        if (isInviterJoinToNewRoom(message.data, inviterId)) {
                            // Before the resolve, so a probe loop between two awaits sees it at once.
                            settled = true;
                            resolve({ channelId: message.data.channelId, source: 'push' });
                        }
                    });
            });

            try {
                // The tiers never reject: a throw inside one (a cache read, say) is a room not found.
                const tiers = viaTiers().catch(() => none);
                let winner: { channelId: string | null; source: InviteChannelSource } = await Promise.race([
                    viaPush,
                    tiers,
                ]);
                // The tiers gave up while the push may still be on its way — with no active place
                // they give up almost at once. Give the push until ROOM_PUSH_WAIT_MS from the start.
                const left = ROOM_PUSH_WAIT_MS - (Date.now() - startedAt);
                if (!winner.channelId && inviterId && aliveRef.current && left > 0) {
                    winner = await Promise.race([viaPush, sleep(left).then(() => winner)]);
                }
                settled = true;
                if (!aliveRef.current) return null;
                onResolved?.(winner.source);
                return winner.channelId;
            } finally {
                tierThree.abort();
                stopWatching();
            }
        },
        []
    );

    return { resolveChannel };
};
