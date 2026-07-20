import { useCallback, useLayoutEffect, useRef } from 'react';

// Module-level cache of scrollTop per key. Survives a route's unmount/remount within the
// SPA session (page-transition navigation unmounts the page), which plain component state
// cannot. Not persisted across a full reload — a fresh load should start at the top.
const scrollPositions = new Map<string, number>();

/**
 * Preserve a scroll container's position across route unmount/remount — e.g. leaving the
 * home list to open a chat room and coming back should land where you were, not at the top.
 *
 * Attach the returned `containerRef`/`onScroll` to the scrollable element. The position is
 * saved on every scroll and restored once `ready` is true, i.e. after the list content has
 * rendered, so the restored offset isn't clamped against a not-yet-populated (short) list.
 */
export const useScrollRestoration = (key: string, ready: boolean) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const onScroll = useCallback(() => {
        const el = containerRef.current;
        if (el) scrollPositions.set(key, el.scrollTop);
    }, [key]);

    useLayoutEffect(() => {
        if (!ready) return;
        const el = containerRef.current;
        const saved = scrollPositions.get(key);
        if (el && saved != null) {
            el.scrollTop = saved;
        }
    }, [key, ready]);

    return { containerRef, onScroll };
};
