/**
 * Is this page running inside the native app shell's WebView?
 *
 * Probed from the injected `ReactNativeWebView` bridge handle rather than a user agent, so it answers
 * "can I reach the shell" instead of "what browser is this".
 *
 * Not a cache concept: the invited-cloud sync trigger asks it, and so do (through the package barrel)
 * three places in apps/web. The web cache ports in `@chatic/runtime-web` keep their own copy of the
 * probe (`isInPhoneApp`), since an adapter does not import the React surface.
 */
export const isNativeApp = (): boolean => {
    return typeof window !== 'undefined' && !!(window as any).ReactNativeWebView;
};
