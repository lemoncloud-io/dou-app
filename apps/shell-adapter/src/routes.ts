import type { DeepLinkResolution, PushNavigationData } from 'shell-adapter/mobile-deeplink';

export const mobileRoutes: {
    pushTapPath?: (data: PushNavigationData | undefined | null) => string | null;
    deepLink?: (url: string) => DeepLinkResolution;
} = {};

export const pushTapNavigation = (
    data: Record<string, string> | undefined
): { path: string; replace: false } | undefined => {
    const path = route('pushTapPath')(data);
    return path === null ? undefined : { path, replace: false };
};

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
