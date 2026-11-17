import { useCallback, useRef, useState } from 'react';

/** Where a scrolled list stands relative to the chrome (header, tabs) above it. */
export interface ScrollChrome {
    /** The list has moved off its top: content is now passing under the header. */
    scrolled: boolean;
    /** The sticky row marked by the anchor has reached the top of the scroll area and stays there. */
    pinned: boolean;
}

const AT_TOP: ScrollChrome = { scrolled: false, pinned: false };

/**
 * Pure part of {@link useScrollChrome}. `anchorOffset` is the anchor's distance below the top of the
 * scroll area; the sticky row right after it has pinned once that reaches `pinAt` — the row's own
 * sticky `top`, which is negative when the row tucks part of itself under the header. `null` means
 * there is no anchor on screen (no sticky row), which can never be pinned.
 *
 * Pinned also needs `scrollTop > 0`: an anchor that starts at the very top of the list (nothing
 * above the row) sits at offset 0 before anything has moved, and an unscrolled list has nothing
 * passing under the row to separate it from.
 */
export const scrollChromeOf = (scrollTop: number, anchorOffset: number | null, pinAt = 0): ScrollChrome => {
    const scrolled = scrollTop > 0;
    return { scrolled, pinned: scrolled && anchorOffset !== null && anchorOffset <= pinAt };
};

export interface UseScrollChromeResult extends ScrollChrome {
    /**
     * Put on a zero-height element right before the sticky row. The sticky row itself cannot be
     * measured for this: once stuck, its own position no longer moves with the list.
     */
    anchorRef: React.RefObject<HTMLDivElement | null>;
    /** Call from the scroll container's `onScroll` with the container. */
    track: (container: HTMLElement) => void;
}

/**
 * Lets a screen restyle its header as the list under it scrolls — a divider once content passes
 * under the header, a different one once a sticky tab row pins below it. Re-renders only when one
 * of the two flags flips, not on every scroll event.
 *
 * `pinAt` is the sticky row's CSS `top` in pixels (0 for `top-0`).
 *
 * Driven by the scroll event alone. A programmatic offset (a scroll restore) fires one too, so a
 * return to a list part-way down lands with the right chrome.
 */
export const useScrollChrome = (pinAt = 0): UseScrollChromeResult => {
    const anchorRef = useRef<HTMLDivElement>(null);
    const [chrome, setChrome] = useState<ScrollChrome>(AT_TOP);

    const track = useCallback(
        (container: HTMLElement) => {
            const anchor = anchorRef.current;
            // Measured against the container's box rather than via offsetTop: the pull-to-refresh
            // wrapper moves the content with a transform, which offsetTop does not see.
            const anchorOffset = anchor
                ? anchor.getBoundingClientRect().top - container.getBoundingClientRect().top
                : null;
            const next = scrollChromeOf(container.scrollTop, anchorOffset, pinAt);
            setChrome(prev => (prev.scrolled === next.scrolled && prev.pinned === next.pinned ? prev : next));
        },
        [pinAt]
    );

    return { ...chrome, anchorRef, track };
};
