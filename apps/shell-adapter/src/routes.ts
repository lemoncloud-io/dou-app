import type { DeepLinkResolution, PushNavigationData } from 'shell-adapter/mobile-deeplink';

/**
 * The mobile app's route functions, as the event maps in `hybrid-shell.config.ts` call them.
 *
 * The config is read by the CLI in Node as well as by the shell page, and the route functions import
 * React Native modules that only load in the page, behind the stub aliases. So the config does not
 * import them: the handler module, which only the page loads, puts them here, and the page loads that
 * module before the shell starts — an event map never finds this empty.
 */
export const mobileRoutes: {
    pushTapPath?: (data: PushNavigationData | undefined | null) => string | null;
    deepLink?: (url: string) => DeepLinkResolution;
} = {};

/** Where a push tap goes: the app's own answer, or `undefined` — no navigation — when it has none. */
export const pushTapNavigation = (
    data: Record<string, string> | undefined
): { path: string; replace: false } | undefined => {
    const path = route('pushTapPath')(data);
    return path === null ? undefined : { path, replace: false };
};

/**
 * Where a link goes. A link the app opens on a native screen, or one it rejects, has nowhere to go in
 * the web: the tool fails with the reason instead of sending the web a navigation it never gets.
 */
export const deepLinkNavigation = (url: string): { path: string; replace: false } => {
    const resolution = route('deepLink')(url.trim());
    if (resolution.kind === 'web') return { path: resolution.path, replace: false };
    if (resolution.kind === 'native') {
        throw new Error(
            'NATIVE_ROUTE: the link opens a native screen of the mobile app, which the virtual shell does not have'
        );
    }
    throw new Error(`UNRESOLVED: ${resolution.error}`);
};

const route = <K extends keyof typeof mobileRoutes>(name: K): NonNullable<(typeof mobileRoutes)[K]> => {
    const fn = mobileRoutes[name];
    if (!fn) throw new Error(`the handler module has not loaded the mobile route functions (${name})`);
    return fn;
};
