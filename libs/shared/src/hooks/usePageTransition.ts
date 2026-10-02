import { useCallback, useMemo } from 'react';
import type { NavigateWithTransitionFn, PageTransitionConfig, PlatformType } from '@lemoncloud/react-page-transition';
import { useNavigateWithTransition as useNavigateWithTransitionOriginal } from '@lemoncloud/react-page-transition';

import { useDeviceInfo } from '@chatic/device-utils';

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

/** Platform detection using @chatic/app-messages for native app bridge. */
const usePageTransitionConfig = (): PageTransitionConfig => {
    const { deviceInfo } = useDeviceInfo();
    const pageTransitionPlatform = getPageTransitionPlatform(deviceInfo?.platform);

    return useMemo(
        () => ({
            platform: pageTransitionPlatform ?? 'auto',
        }),
        [pageTransitionPlatform]
    );
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
 * already frosts during the lift and holding it opaque would only delay the glass.
 *
 * Everywhere else it is set for every navigation through the hook, including the ones that end up not
 * transitioning (a `replace`, an engine without view transitions); those settle within a microtask, so
 * the hold they cause is not visible.
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
 * Wrapper with @chatic/app-messages platform detection. See @lemoncloud/react-page-transition for API
 * docs. Outside Android it also marks the document while the navigation runs
 * (`PAGE_TRANSITION_ATTRIBUTE`).
 */
export const useNavigateWithTransition = (): NavigateWithTransitionFn => {
    const config = usePageTransitionConfig();
    const navigate = useNavigateWithTransitionOriginal(config);
    const marksDocument = config.platform !== 'android';

    return useCallback<NavigateWithTransitionFn>(
        (to, options) => {
            if (!marksDocument) return navigate(to, options);
            const settle = markNavigationStarted();
            try {
                return navigate(to, options).finally(settle);
            } catch (error) {
                settle();
                throw error;
            }
        },
        [navigate, marksDocument]
    );
};
