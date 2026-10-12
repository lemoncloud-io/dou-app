import { useLayoutEffect, useRef, type RefObject } from 'react';

export const STACK_IN_DURATION_MS = 220;
const STACK_IN_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/**
 * Grows a freshly mounted row from zero height to its own, so a message I just sent stacks onto
 * the bottom of the reversed list and pushes the rows above it up, instead of appearing at once.
 *
 * Height, not a transform: in a `flex-col-reverse` list sitting at the bottom, a row growing from
 * zero is what moves everything above it, which is the "stacking" the effect is for. A transform
 * would slide the bubble in while its neighbours had already jumped. The sender is always pinned to
 * the bottom while this runs (`useChatScroll` follows the author down), so the WebKit history
 * correction that measures row offsets never sees the growth.
 *
 * Decided once, at mount: a failed row that turns pending again on retry is already in place, and
 * replaying the entrance would read as a second message.
 */
export const useStackIn = (ref: RefObject<HTMLElement | null>, enabled: boolean): void => {
    const enabledAtMount = useRef(enabled);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!enabledAtMount.current || !el || typeof el.animate !== 'function') return;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

        const height = el.offsetHeight;
        // The flex gap above the row exists from the first frame; pulling it in with a negative
        // margin keeps the neighbours from jumping by the gap before the row starts to grow.
        const gap = el.parentElement ? parseFloat(getComputedStyle(el.parentElement).rowGap) || 0 : 0;

        el.style.overflow = 'hidden';
        const animation = el.animate(
            [
                { height: '0px', marginTop: `${-gap}px`, opacity: 0 },
                { height: `${height}px`, marginTop: '0px', opacity: 1 },
            ],
            { duration: STACK_IN_DURATION_MS, easing: STACK_IN_EASING }
        );
        const release = () => {
            el.style.overflow = '';
        };
        animation.onfinish = release;
        animation.oncancel = release;

        return () => {
            // Released here rather than through `oncancel`, which fires later: under StrictMode the
            // effect runs again on the same element, and a late release would drop the new clip.
            animation.onfinish = null;
            animation.oncancel = null;
            animation.cancel();
            release();
        };
        // Mount-only by design — see the note on `enabledAtMount`.
    }, []);
};
