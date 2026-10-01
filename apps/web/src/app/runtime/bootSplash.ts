import { useLayoutEffect } from 'react';

import { logger } from '@chatic/bridges';

import { appBridge } from '../bridge/appBridge';

/**
 * Why the boot cover came down — logged, so a boot that ended on the cap or on an error is visible
 * in the field rather than looking like a normal start.
 */
export type BootSplashReleaseReason = 'first-screen' | 'error' | 'cap';

export interface BootSplashDeps {
    /** Removes the `#splash` element `index.html` paints before any script runs. */
    removeCover: () => void;
    /** Tells the native shell the first screen is up, so it can lift its own launch splash. */
    notifyShell: () => void;
    requestFrame: (callback: () => void) => void;
    setTimer: (callback: () => void, ms: number) => void;
}

export interface BootSplash {
    /**
     * Keeps the cover up while something the first screen depends on is still pending — a lazy
     * route's chunk, or a cold-start deep link not yet applied. Returns the release for that hold;
     * calling it more than once is harmless.
     */
    hold(): () => void;
    /** The router has mounted its first route. The cover lifts once no hold remains. */
    markRouteMounted(): void;
    /** Lifts the cover now, whatever is pending. Idempotent. */
    release(reason: BootSplashReleaseReason): void;
    /** Starts the safety cap that lifts the cover even if nothing ever reports ready. */
    armCap(ms: number): void;
}

/**
 * The cover in `index.html` stays until the first real screen has painted, then goes — and in the
 * app that same moment is the native shell's cue to lift its launch splash, so the user sees one
 * splash and then the screen, with nothing in between.
 *
 * "Painted" is a two-frame check once nothing holds the cover: the first frame lets React commit
 * whatever unblocked it, the second is one the browser has actually drawn. A hold taken in that
 * window (a navigation that suspends on a lazy route) cancels the release, so the cover never comes
 * down onto a skeleton that is about to be replaced. One that comes and goes inside it joins the
 * running check instead of restarting it; its content then lands in the same paint as the removal.
 */
export const createBootSplash = (deps: BootSplashDeps): BootSplash => {
    let holds = 0;
    let routeMounted = false;
    let released = false;
    let checkPending = false;

    const release = (reason: BootSplashReleaseReason) => {
        if (released) return;
        released = true;
        logger.info('APP', `[bootSplash] released: ${reason}`);
        deps.removeCover();
        deps.notifyShell();
    };

    const scheduleRelease = () => {
        if (released || checkPending || !routeMounted || holds > 0) return;
        checkPending = true;
        deps.requestFrame(() =>
            deps.requestFrame(() => {
                checkPending = false;
                if (holds === 0) release('first-screen');
            })
        );
    };

    return {
        hold: () => {
            if (released) return () => undefined;
            holds += 1;
            let done = false;
            return () => {
                if (done) return;
                done = true;
                holds -= 1;
                scheduleRelease();
            };
        },
        markRouteMounted: () => {
            routeMounted = true;
            scheduleRelease();
        },
        release,
        armCap: ms => deps.setTimer(() => release('cap'), ms),
    };
};

/** App-wide instance. The cap is armed in `main.tsx`. */
export const bootSplash = createBootSplash({
    removeCover: () => document.getElementById('splash')?.remove(),
    notifyShell: () => appBridge.notifyFirstScreenReady(),
    requestFrame: callback => window.requestAnimationFrame(() => callback()),
    setTimer: (callback, ms) => window.setTimeout(callback, ms),
});

/**
 * Holds the boot cover for as long as the calling component is mounted. A layout effect, so the
 * hold is in place before the router's own mount effect asks whether the cover may lift.
 */
export const useBootSplashHold = (): void => {
    useLayoutEffect(() => bootSplash.hold(), []);
};
