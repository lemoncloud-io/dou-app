import { useCallback, useEffect, useRef } from 'react';

import { useAwaitInviteChannel, useRelayInviteMutations } from '../../../hooks';

/**
 * Delays before each tier-2 `invite.get` probe, applied before the probe it precedes.
 *
 * The first is 0: `InviteModel.channelId` is documented as "수락으로 생긴 dm 방", and a re-invite
 * reuses an existing room (05-client-guide §제약), so the field can already be filled by the time we
 * ask. The second covers a room that lands a moment later.
 *
 * Kept to two on purpose. Tier 3 watches actual channel rows and is the more robust mechanism, but it
 * only starts once probing gives up — so every extra probe both delays the answer and postpones the
 * better path. Two costs 1.5s in the worst case; a third at +4s would buy little that tier 3's own 3s
 * polling does not already cover.
 */
export const CHANNEL_PROBE_DELAYS_MS = [0, 1_500];

export interface ResolveInviteChannelOptions {
    /** Tier 1: the `channelId` the `invite.accept` response carried, when it carried one. */
    acceptedChannelId?: string;
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
 * The room is created asynchronously — "초대는 코드만 만든다. 방은 수락 순간 생긴다" — so whether
 * `invite.accept` answers with the id depends on how far the backend has got (05-client-guide §미구현).
 * Rather than assume, this reads the value if it is already there and only then falls back to the
 * slower, broader mechanisms. The guide names both fallbacks: "채널 목록이 갱신되기를 기다리거나
 * 다시 조회한다".
 *
 * 1. the accept response's `channelId` (no wait at all)
 * 2. `invite.get` probes on {@link CHANNEL_PROBE_DELAYS_MS}
 * 3. `useAwaitInviteChannel` — watch the channel list for a new `dm` row
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
                probeDelaysMs = CHANNEL_PROBE_DELAYS_MS,
                knownChannelIds,
                timeoutMs,
                pollMs,
            } = options;

            // Tier 1 — already in hand.
            if (acceptedChannelId) return acceptedChannelId;

            // Tier 2 — re-read the invite; `channelId` fills in once the room exists.
            for (const delayMs of probeDelaysMs) {
                if (delayMs > 0) await sleep(delayMs);
                if (!aliveRef.current) return null;
                try {
                    // Only `channelId` is read. The probe deliberately ignores `state` — this runs after
                    // a successful accept, so `state` is `accepted` and must not be mistaken for the
                    // "already joined" case the entry read uses it for.
                    const probed = await latest.current.getInvite(code);
                    if (!aliveRef.current) return null;
                    if (probed?.channelId) return probed.channelId;
                } catch {
                    // Best-effort: drop this tier and let the list watch below try.
                    if (!aliveRef.current) return null;
                }
            }

            // Tier 3 — watch the channel list (the original, invite-agnostic path).
            return latest.current.awaitChannel({ knownChannelIds, timeoutMs, pollMs });
        },
        []
    );

    return { resolveChannel };
};
