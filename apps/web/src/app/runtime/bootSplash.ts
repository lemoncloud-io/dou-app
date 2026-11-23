import { useLayoutEffect } from 'react';

import { logger } from '@chatic/bridges';

import { appBridge } from '../bridge/appBridge';

export type BootSplashReleaseReason = 'first-screen' | 'error' | 'cap';

export interface BootSplashDeps {
    removeCover: () => void;
    notifyShell: () => void;
    requestFrame: (callback: () => void) => void;
    setTimer: (callback: () => void, ms: number) => void;
}

export interface BootSplash {
    hold(): () => void;
    markRouteMounted(): void;
    release(reason: BootSplashReleaseReason): void;
    armCap(ms: number): void;
}

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

export const bootSplash = createBootSplash({
    removeCover: () => document.getElementById('splash')?.remove(),
    notifyShell: () => appBridge.notifyFirstScreenReady(),
    requestFrame: callback => window.requestAnimationFrame(() => callback()),
    setTimer: (callback, ms) => window.setTimeout(callback, ms),
});

export const useBootSplashHold = (): void => {
    useLayoutEffect(() => bootSplash.hold(), []);
};
