/**
 * Checks whether the current runtime environment is inside a native app (WebView).
 * Detects per-device bridge injection for Android, iOS (WebKit), React Native WebView, etc.
 */
export const isNative = (): boolean =>
    typeof window !== 'undefined' &&
    !!(
        window.ReactNativeWebView?.postMessage ||
        window.ChaticMessageHandler?.postMessage ||
        window.webkit?.messageHandlers?.ChaticMessageHandler?.postMessage
    );
