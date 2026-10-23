import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * Every scroll animation on the page is registered under this query. A visitor who asked the OS for
 * reduced motion gets no tween at all, so the page they see is the markup's own end state: full
 * opacity, no pin, no scrub.
 */
export const MOTION_OK = '(prefers-reduced-motion: no-preference)';

/**
 * Builds a section's animations inside a `gsap.matchMedia` scoped to the section, and reverts every
 * tween, pin and ScrollTrigger it made when the section unmounts or the media query flips.
 * `setup` receives the matchMedia so a section can add breakpoint-specific scenes (the pinned
 * split only exists on wide screens).
 */
export const useMotion = (
    scope: RefObject<HTMLElement | null>,
    setup: (mm: gsap.MatchMedia, root: HTMLElement) => void
): void => {
    // Each section declares `setup` inline, so it is a new function every render. Reading it through
    // a ref keeps the scene built once per mount instead of tearing down every ScrollTrigger on each
    // state change (the carousel and the accordion re-render on every interaction).
    const setupRef = useRef(setup);
    setupRef.current = setup;

    useLayoutEffect(() => {
        const root = scope.current;
        if (!root) return undefined;
        const mm = gsap.matchMedia(root);
        setupRef.current(mm, root);
        return () => mm.revert();
    }, [scope]);
};

export { gsap };
