import { useCallback, useLayoutEffect, useRef } from 'react';

// Module-level cache of scrollTop per key. Survives a route's unmount/remount within the SPA
// session (page-transition navigation unmounts the page), which plain component state cannot.
// Not persisted across a full reload — a fresh load should start at the top.
const scrollPositions = new Map<string, number>();

/** Remember a scroll offset for `key`. Also called on every scroll, not just on the way out. */
export const stashScroll = (key: string, top: number): void => {
    scrollPositions.set(key, top);
};

/**
 * Read and clear the saved offset for `key`. Take-and-clear rather than a peek: a mount claims
 * the offset once, and `hasPendingRestore` needs to tell "claimed, waiting for `ready`" apart from
 * "nothing was ever saved" — a non-clearing read couldn't distinguish the two after the value is
 * applied. `onScroll` keeps the map itself current regardless, for the NEXT mount to claim.
 */
export const takeScroll = (key: string): number | null => {
    const saved = scrollPositions.get(key);
    if (saved === undefined) return null;
    scrollPositions.delete(key);
    return saved;
};

export interface UseScrollRestorationResult {
    containerRef: React.RefObject<HTMLDivElement | null>;
    onScroll: () => void;
    /** True while a saved offset is still waiting for `ready` content to land. */
    hasPendingRestore: () => boolean;
    /**
     * Release the pending flag. Only relevant with `manualConsume: true` — see that option. A
     * caller that didn't pass it can ignore this; the hook already cleared the flag for them.
     */
    consumePendingRestore: () => void;
}

export interface UseScrollRestorationOptions {
    /**
     * Keep `hasPendingRestore` true after the offset is applied, until the caller explicitly calls
     * `consumePendingRestore`. For a caller with its OWN scroll behaviour that would fight the
     * restore — an auto-scroll-to-bottom pin reacting to the same content becoming ready — clearing
     * the flag inside THIS hook's layout effect is a commit too early: layout effects run before
     * passive ones, so the pin's passive effect would see "nothing pending" in the very same commit
     * and undo the restore a frame later. Deferring lets that effect check `hasPendingRestore`
     * first and consume it itself, in its own commit.
     *
     * Omit for a plain scroll container with no competing behaviour (a list) — the default already
     * clears the flag once applied.
     */
    manualConsume?: boolean;
}

/**
 * Preserve a scroll container's position across a route's unmount/remount — leaving a list (or a
 * chat room) and coming back should land where the reader left it, not at the top (or, for a
 * bottom-anchored reversed list, the newest item).
 *
 * `key` scopes the memory: a fixed string for a singleton screen (the home list), a per-subject id
 * for a screen that remounts per subject (a channel id for a chat room). `null`/`undefined`
 * disables restoration entirely — no read, no write — for a caller whose subject isn't resolved
 * yet. `ready` gates the actual restore until the container has content to scroll through: applying
 * an offset against an empty/short list clamps to 0 and silently loses it.
 *
 * Attach `containerRef`/`onScroll` to the scrollable element. The offset is written on every
 * scroll rather than deferred to unmount, because React detaches host refs before a parent's
 * layout-effect cleanup runs — reading the container at that point would already be null.
 */
export const useScrollRestoration = (
    key: string | null | undefined,
    ready: boolean,
    options?: UseScrollRestorationOptions
): UseScrollRestorationResult => {
    const containerRef = useRef<HTMLDivElement>(null);
    // An offset left behind by a previous visit, waiting for `ready` content. Carries its own key
    // so a stale claim can never be applied after `key` changes out from under it.
    const pendingRef = useRef<{ key: string; top: number } | null>(null);
    const manualConsume = !!options?.manualConsume;

    useLayoutEffect(() => {
        if (!key) return;
        const saved = takeScroll(key);
        if (saved !== null) pendingRef.current = { key, top: saved };

        return () => {
            // A claim that was never applied (unmounted before `ready`) goes back untouched. There
            // is no "else write the current position" branch: `onScroll` already keeps the map
            // current on every real scroll, and by the time this cleanup runs React has already
            // detached the host ref for an unmounting container — reading it here would see null
            // (or, worse, a live container whose scrollTop is now stale/irrelevant) rather than the
            // last real position, so re-deriving anything from `containerRef.current` here would
            // only make things worse, never better.
            const unspent = pendingRef.current;
            if (unspent?.key === key) stashScroll(key, unspent.top);
        };
    }, [key]);

    useLayoutEffect(() => {
        if (!key) return;
        const pending = pendingRef.current;
        if (!pending || pending.key !== key || !ready) return;
        const el = containerRef.current;
        if (!el) return;
        if (el.scrollHeight > el.clientHeight) {
            el.scrollTop = pending.top;
            if (!manualConsume) pendingRef.current = null;
        }
    }, [key, ready, manualConsume]);

    const onScroll = useCallback(() => {
        if (!key) return;
        const el = containerRef.current;
        if (el) stashScroll(key, el.scrollTop);
    }, [key]);

    const hasPendingRestore = useCallback(() => !!key && pendingRef.current?.key === key, [key]);
    const consumePendingRestore = useCallback(() => {
        if (key && pendingRef.current?.key === key) pendingRef.current = null;
    }, [key]);

    return { containerRef, onScroll, hasPendingRestore, consumePendingRestore };
};
