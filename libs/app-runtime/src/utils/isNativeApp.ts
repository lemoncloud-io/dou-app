/**
 * Is this page running inside the native app shell's WebView?
 *
 * Probed from the injected `ReactNativeWebView` bridge handle rather than a user agent, so it answers
 * "can I reach the shell" instead of "what browser is this".
 *
 * Lived in `data/cacheStorageRouting.ts` because that file was its first caller. It is not a cache
 * concept though — the cache router asks it, and so do the invited-cloud sync trigger, the global
 * search source and (through the package barrel) three places in apps/web. Domain-free environment
 * probe, so it sits with the other domain-free primitives.
 */
export const isNativeApp = (): boolean => {
    return typeof window !== 'undefined' && !!(window as any).ReactNativeWebView;
};
