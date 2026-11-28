import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { executePageTransition, isViewTransitionSupported } from '@lemoncloud/page-transition-core';
import type { PlatformType } from '@lemoncloud/page-transition-core';
import type { NavigateWithTransitionFn } from '@lemoncloud/react-page-transition';

import { hostProfile } from '@chatic/bridges';

// eslint-disable-next-line @nx/enforce-module-boundaries -- waitForDestination moved to runtime-react, which is not buildable; this hook stays here until its owner is decided
import { waitForDestination } from '@chatic/runtime-react/react-utils';

const getPageTransitionPlatform = (platform: string | undefined): PlatformType | undefined => {
    switch (platform) {
        case 'android':
            return 'android';
        case 'ios':
            return 'ios';
        default:
            return undefined;
    }
};

const PAGE_TRANSITION_ATTRIBUTE = 'data-page-transition';

let navigationsRunning = 0;

const markNavigationStarted = (): (() => void) => {
    navigationsRunning += 1;
    document.documentElement.setAttribute(PAGE_TRANSITION_ATTRIBUTE, '');
    let settled = false;
    return () => {
        if (settled) return;
        settled = true;
        navigationsRunning -= 1;
        if (navigationsRunning === 0) document.documentElement.removeAttribute(PAGE_TRANSITION_ATTRIBUTE);
    };
};

let transitionsRunning = 0;
let latestTransitionNavigated: Promise<void> = Promise.resolve();

export const useNavigateWithTransition = (): NavigateWithTransitionFn => {
    const navigate = useNavigate();
    const platform = getPageTransitionPlatform(hostProfile().globals.CHATIC_APP_PLATFORM);
    const marksDocument = platform !== 'android';

    return useCallback<NavigateWithTransitionFn>(
        (to, options) => {
            const { transition, direction, animation, customization, ...navigateOptions } = options ?? {};
            const go = () => (typeof to === 'number' ? navigate(to) : navigate(to, navigateOptions));
            const settle = marksDocument ? markNavigationStarted() : () => undefined;

            try {
                const animates =
                    (transition ?? !navigateOptions.replace) && animation !== 'none' && isViewTransitionSupported();
                if (!animates) {
                    go();
                    settle();
                    return Promise.resolve();
                }
                if (transitionsRunning > 0) {
                    return latestTransitionNavigated.then(go).finally(settle);
                }

                let navigated!: () => void;
                latestTransitionNavigated = new Promise<void>(resolve => {
                    navigated = resolve;
                });
                transitionsRunning += 1;
                let finished = false;
                const finish = () => {
                    if (finished) return;
                    finished = true;
                    transitionsRunning -= 1;
                    navigated();
                    settle();
                };
                const traversal = typeof to === 'number';
                try {
                    return executePageTransition(
                        () => {
                            const landed = waitForDestination({ traversal });
                            try {
                                go();
                            } finally {
                                navigated();
                            }
                            return landed;
                        },
                        {
                            animation,
                            direction: direction ?? (traversal && to < 0 ? 'back' : 'forward'),
                            config: { platform: platform ?? 'auto' },
                            customization,
                        }
                    ).finally(finish);
                } catch (error) {
                    finish();
                    throw error;
                }
            } catch (error) {
                settle();
                throw error;
            }
        },
        [navigate, platform, marksDocument]
    );
};
