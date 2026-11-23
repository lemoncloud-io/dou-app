export const isNative = (): boolean =>
    typeof window !== 'undefined' &&
    !!(
        window.ReactNativeWebView?.postMessage ||
        window.ChaticMessageHandler?.postMessage ||
        window.webkit?.messageHandlers?.ChaticMessageHandler?.postMessage
    );
