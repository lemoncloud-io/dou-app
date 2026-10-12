import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * Measures overlay chrome (a floating header and/or bottom bar) so the scrollable body can
 * reserve exactly that much padding.
 *
 * Screens are laid out full-screen with the header and bottom bar stacked on top via z-index,
 * rather than as flex-col siblings that push the body down. That is what lets the translucent
 * chrome show the content scrolling underneath it — but it also means the body no longer gets
 * its offset for free, so the header/footer heights have to be fed back in as padding.
 */
export const useChromeInsets = () => {
    const headerRef = useRef<HTMLDivElement>(null);
    const footerRef = useRef<HTMLDivElement>(null);
    const [headerHeight, setHeaderHeight] = useState(0);
    const [footerHeight, setFooterHeight] = useState(0);

    // While set, the footer's resizes go here, in the frame they happen, instead of into a render.
    const footerFollower = useRef<((height: number) => void) | null>(null);

    // Elements already measured synchronously. A WeakSet rather than a boolean because the chrome
    // is conditionally rendered (see KeyboardAwareLayout): a footer can attach on a later render,
    // and it needs the same first-paint measurement the header got on mount.
    const syncMeasured = useRef(new WeakSet<Element>());

    useLayoutEffect(() => {
        const headerEl = headerRef.current;
        const footerEl = footerRef.current;
        if (!headerEl && !footerEl) return;

        // Measure once, synchronously, the first time an element appears.
        //
        // ResizeObserver alone is not enough: its first callback is delivered in a later frame, so
        // the body would paint once with zero insets — content sitting under the floating header
        // (which then has nothing behind it to blur) and everything jumping ~60px when the real
        // heights land. Setting state from a layout effect re-renders before paint, so the first
        // frame is already correct. Guarded per element so this forced layout read happens once
        // per chrome element, not on every render of a long message list.
        if (headerEl && !syncMeasured.current.has(headerEl)) {
            syncMeasured.current.add(headerEl);
            setHeaderHeight(headerEl.offsetHeight);
        }
        if (footerEl && !syncMeasured.current.has(footerEl)) {
            syncMeasured.current.add(footerEl);
            setFooterHeight(footerEl.offsetHeight);
        }

        // Border-box, NOT contentRect: the chrome carries its insets as padding — the header's
        // safe-top and the composer's keyboard/home-indicator bottom — and contentRect excludes
        // padding. Measuring the content box under-reports by exactly those insets, which is what
        // left the last chat message unreachable behind a raised keyboard.
        const measure = (entry: ResizeObserverEntry): number =>
            entry.borderBoxSize?.[0]?.blockSize ?? (entry.target as HTMLElement).offsetHeight;

        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                const height = measure(entry);
                if (entry.target === headerEl) setHeaderHeight(height);
                if (entry.target !== footerEl) continue;
                const follow = footerFollower.current;
                if (follow) follow(height);
                else setFooterHeight(height);
            }
        });
        // `box: 'border-box'` is required, not just cosmetic: ResizeObserver defaults to the
        // content box, and a keyboard opening only changes the composer's padding — the content
        // box stays identical, so the callback would never fire and the measurement would go stale.
        if (headerEl) observer.observe(headerEl, { box: 'border-box' });
        if (footerEl) observer.observe(footerEl, { box: 'border-box' });
        return () => observer.disconnect();
    });

    /**
     * Hands the footer's size changes to `follow` instead of a render, until called again with `null`.
     * For a footer that something moves on every frame for a while — the attach panel's slide carries the
     * room's composer — where a render of the whole screen per frame is the cost, and what follows the
     * footer (a list's bottom padding) can be written directly. `follow` runs in the observer's callback,
     * which comes after layout and before paint, so a write there lands in the frame that moved the footer.
     *
     * Letting go measures the footer once, there and then, hands that to the last `follow` and renders
     * it: the page catches up in one render, and what was following lands on the same final height in
     * the same frame.
     */
    const followFooter = useCallback((follow: ((height: number) => void) | null) => {
        const was = footerFollower.current;
        footerFollower.current = follow;
        if (follow || !was) return;
        const footer = footerRef.current;
        if (!footer) return;
        const height = footer.getBoundingClientRect().height;
        was(height);
        setFooterHeight(height);
    }, []);

    return { headerRef, footerRef, headerHeight, footerHeight, followFooter };
};
