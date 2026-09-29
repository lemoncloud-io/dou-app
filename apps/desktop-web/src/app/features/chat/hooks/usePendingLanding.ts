import { useCallback, useEffect, useRef } from 'react';

/**
 * How long a deferred landing (channel / place / jump / thread) stays armed.
 * Comfortably past the handshake wait plus a switch; after it, the landing is
 * dropped rather than left to fire on some later, unrelated navigation.
 */
export const PENDING_LANDING_TTL_MS = 30_000;

/**
 * The home screen's deferred landings: what to open once the data it needs has loaded.
 *
 * The refs arm on intent and clear on success — with no failure branch. When a cross-place or
 * cross-cloud switch rolls back, or a room never reaches the list, nothing consumes them, and they
 * used to stay armed until any later load happened to match. Every deferred arming now calls
 * `armPendingExpiry`; when its timer fires, whatever is still pending is abandoned. Re-arming
 * restarts the timer, and unmounting cancels it.
 */
export const usePendingLanding = () => {
    // A channel to open once it is listed (notification click across places: switchPlace resets
    // selection, so it is re-applied; a room just created or started reaches the list later).
    const pendingChannelRef = useRef<string | null>(null);
    // A place to land once a cross-cloud notification switch loads the new cloud's
    // places — the auto-select-first effect honors this instead of the first place.
    const pendingPlaceRef = useRef<string | null>(null);
    // A message to scroll to once a cross-place jump's channel has loaded (paired
    // with pendingChannelRef when the saved item lives in another place).
    const pendingJumpRef = useRef<{ channelId: string; chatNo: number; restore?: boolean } | null>(null);
    // Set when the deferred open is a NOTIFICATION click (not a saved jump): the
    // channel should land at its latest message once it loads (requestOpenAtBottom).
    const pendingOpenAtBottomRef = useRef<string | null>(null);
    // A thread to open once its channel is selected + loaded. Deferred (not opened
    // inline) because selecting a different channel runs closeThread() on its way
    // in — a same-tick open would be clobbered. Set for saved/mention thread replies.
    const pendingThreadRef = useRef<{ channelId: string; rootId: string } | null>(null);

    const pendingExpiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const armPendingExpiry = useCallback(() => {
        if (pendingExpiryRef.current) clearTimeout(pendingExpiryRef.current);
        pendingExpiryRef.current = setTimeout(() => {
            pendingExpiryRef.current = null;
            pendingChannelRef.current = null;
            pendingPlaceRef.current = null;
            pendingJumpRef.current = null;
            pendingThreadRef.current = null;
            pendingOpenAtBottomRef.current = null;
        }, PENDING_LANDING_TTL_MS);
    }, []);
    useEffect(
        () => () => {
            if (pendingExpiryRef.current) clearTimeout(pendingExpiryRef.current);
        },
        []
    );

    return {
        pendingChannelRef,
        pendingPlaceRef,
        pendingJumpRef,
        pendingOpenAtBottomRef,
        pendingThreadRef,
        armPendingExpiry,
    };
};
