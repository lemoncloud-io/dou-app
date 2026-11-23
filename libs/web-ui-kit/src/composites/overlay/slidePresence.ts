import * as React from 'react';

export const SLIDE_MS = 300;

export const SLIDE_TIMING =
    'duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none';

export const SLIDE_MOTION = `transition-transform ${SLIDE_TIMING}`;

export const SLIDE_FALLBACK_MS = SLIDE_MS + 100;

export const slideEase = (progress: number): number => {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    const at = (t: number, p1: number, p2: number) =>
        3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
    let low = 0;
    let high = 1;
    let t = progress;
    for (let i = 0; i < 30; i += 1) {
        t = (low + high) / 2;
        if (at(t, 0.32, 0) < progress) low = t;
        else high = t;
    }
    return at(t, 0.72, 1);
};

export const prefersReducedMotion = (): boolean =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

export type SlideMode = 'slide' | 'instant';

export type SlideMotion = 'self' | 'external';

export type SlideState = 'open' | 'closed';

export interface SlidePresenceOptions {
    enter?: SlideMode;
    exit?: SlideMode;
    property?: string;
    motion?: SlideMotion;
    onSettled?: (state: SlideState) => void;
}

export interface SlidePresence<T extends HTMLElement> {
    mounted: boolean;
    shown: boolean;
    instant: boolean;
    ref: React.RefObject<T | null>;
    onTransitionEnd: (event: React.TransitionEvent<T>) => void;
    finish: () => void;
}

export const useSlidePresence = <T extends HTMLElement>(
    open: boolean,
    { enter = 'slide', exit = 'slide', property = 'transform', motion = 'self', onSettled }: SlidePresenceOptions = {}
): SlidePresence<T> => {
    const ref = React.useRef<T | null>(null);
    const [mountedState, setMounted] = React.useState(open);
    const [shownState, setShown] = React.useState(open);

    const external = motion === 'external';
    const reduced = prefersReducedMotion();
    const enterInstant = enter === 'instant' || reduced;
    const exitInstant = exit === 'instant' || reduced;
    const instant = open ? enterInstant : exitInstant;
    const mounted = open ? mountedState || enterInstant || external : mountedState && !exitInstant;
    const shown = open ? enterInstant || shownState : external && shownState;

    const pending = React.useRef<SlideState | null>(null);
    const settledRef = React.useRef(onSettled);
    settledRef.current = onSettled;
    const externalRef = React.useRef(external);
    externalRef.current = external;
    const propertyRef = React.useRef(property);
    propertyRef.current = property;
    const settle = React.useCallback((state: SlideState) => {
        if (pending.current !== state) return;
        pending.current = null;
        settledRef.current?.(state);
    }, []);
    const land = React.useCallback(
        (state: SlideState) => {
            if (pending.current !== state) return;
            if (state === 'closed') setMounted(false);
            if (externalRef.current) setShown(state === 'open');
            settle(state);
        },
        [settle]
    );

    React.useLayoutEffect(() => {
        if (!open) {
            if (!external || exitInstant) setShown(false);
            if (exitInstant) {
                setMounted(false);
                settle('closed');
            }
            return;
        }
        if (enterInstant) {
            setMounted(true);
            setShown(true);
            return;
        }
        if (!mountedState) {
            setMounted(true);
            return;
        }
        if (external || shownState) return;
        ref.current?.getBoundingClientRect();
        setShown(true);
    }, [open, external, enterInstant, exitInstant, mountedState, shownState, settle]);

    const instantRef = React.useRef(instant);
    instantRef.current = instant;
    const lastOpen = React.useRef(open);
    React.useLayoutEffect(() => {
        if (lastOpen.current === open) return undefined;
        lastOpen.current = open;
        const state: SlideState = open ? 'open' : 'closed';
        pending.current = state;
        if (instantRef.current) {
            if (externalRef.current) ref.current?.style.removeProperty(propertyRef.current);
            settle(state);
            return undefined;
        }
        const timer = window.setTimeout(() => land(state), SLIDE_FALLBACK_MS);
        return () => window.clearTimeout(timer);
    }, [open, settle, land]);

    const onTransitionEnd = (event: React.TransitionEvent<T>) => {
        if (external || event.target !== event.currentTarget || event.propertyName !== property) return;
        if (!open) setMounted(false);
        settle(open ? 'open' : 'closed');
    };

    const finish = React.useCallback(() => {
        const state = pending.current;
        if (externalRef.current && state !== null) land(state);
    }, [land]);

    return { mounted, shown, instant, ref, onTransitionEnd, finish };
};
