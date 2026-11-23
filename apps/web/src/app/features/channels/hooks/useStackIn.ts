import { useLayoutEffect, useRef, type RefObject } from 'react';

export const STACK_IN_DURATION_MS = 220;
const STACK_IN_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

export const useStackIn = (ref: RefObject<HTMLElement | null>, enabled: boolean): void => {
    const enabledAtMount = useRef(enabled);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!enabledAtMount.current || !el || typeof el.animate !== 'function') return;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

        const height = el.offsetHeight;
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
            animation.onfinish = null;
            animation.oncancel = null;
            animation.cancel();
            release();
        };
    }, []);
};
