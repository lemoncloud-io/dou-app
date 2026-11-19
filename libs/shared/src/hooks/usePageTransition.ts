import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { executePageTransition, isViewTransitionSupported } from '@lemoncloud/page-transition-core';
import type { PlatformType } from '@lemoncloud/page-transition-core';
import type { NavigateWithTransitionFn } from '@lemoncloud/react-page-transition';

import { hostProfile } from '@chatic/bridges';

import { waitForDestination } from './waitForDestination';

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

/**
 * Set on `<html>` for as long as a navigation started through `useNavigateWithTransition` is running.
 *
 * WebKit does not paint `backdrop-filter` inside a view transition's snapshots, so a frosted surface
 * slides in unblurred, with the text under it showing through sharp, and frosts in a single frame the
 * moment the transition ends. A component that blurs — web-ui-kit's `HeaderGlass` — holds an opaque
 * stand-in while this attribute is present and fades to frost once it is gone. A DOM attribute rather
 * than an import, so the presentational kit stays free of this lib; `HeaderGlass` spells the same name
 * out itself, and each side's tests pin the literal.
 *
 * Not set on Android. Its WebView is Blink, which does paint the frost inside the snapshots (measured
 * in Chrome 154: a glass header mid-transition is exactly as blurred as one at rest), so a header there
 * already frosts during the transition and holding it opaque would only delay the glass.
 *
 * Everywhere else it is set for every navigation through the hook, including the ones that end up not
 * transitioning (a `replace`, an engine without view transitions); those clear it before returning, so
 * the hold they cause is never painted.
 */
const PAGE_TRANSITION_ATTRIBUTE = 'data-page-transition';

// Navigations overlap — a tap while a transition is still running starts the next one — so the
// attribute comes off only when the last of them has settled.
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

/**
 * View transitions started by this hook that have not finished yet, and the point at which the
 * newest of them has called `navigate`.
 *
 * A navigation that arrives while one is running does not start a second transition. The package
 * clears every class it put on `<html>` when a transition finishes — including the classes a newer,
 * still-running transition put there — so a second back press inside the first one's animation
 * would lose `back-navigation` midway and finish its motion running forward. The second navigation
 * happens without motion instead, underneath the first one's animation, whose incoming screen is
 * live and shows it. It waits for the running transition to have navigated, so two navigations
 * still land in the order they were asked for.
 */
let transitionsRunning = 0;
let latestTransitionNavigated: Promise<void> = Promise.resolve();

/**
 * `navigate` with a platform page transition: the shell's platform (`CHATIC_APP_PLATFORM`, as the host
 * profile took it) picks the animation, a negative history delta plays it backwards, and `replace`
 * skips it unless `transition: true` asks for one. The same options and the same promise as
 * `@lemoncloud/react-page-transition`'s hook, which this replaces rather than wraps for one reason:
 * that hook's update callback returns as soon as `navigate` does, so the browser captured the incoming
 * screen before it was rendered (`waitForDestination` says why, and what it waits for instead).
 *
 * Outside Android it also marks the document while the navigation runs (`PAGE_TRANSITION_ATTRIBUTE`).
 */
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
