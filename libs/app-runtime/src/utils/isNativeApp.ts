/**
 * Is this page running inside the native app shell's WebView?
 *
 * Probed from the injected `ReactNativeWebView` bridge handle rather than a user agent, so it answers
 * "can I reach the shell" instead of "what browser is this".
 *
 * Not a cache concept: apps/web asks it through `runtime.boot`. The invited-cloud sync trigger and the
 * web cache ports in `@chatic/runtime-web` ask the same question of `@chatic/bridges`' host profile
 * (`bridge === 'react-native-webview'`, as `isPhoneAppBridge` there).
 */
export const isNativeApp = (): boolean => {
    return typeof window !== 'undefined' && !!(window as any).ReactNativeWebView;
};
