/**
 * How the client reaches the app: send one JSON string, hear JSON strings back. The page in the app
 * uses `nativeTransport`; tests and the app's own contract suite plug the client straight into a host.
 */
export interface Transport {
    send(message: string): void;
    /** Starts delivering incoming messages to `listener`; the returned function stops it. */
    listen(listener: (message: string) => void): () => void;
}

interface NativeWindow {
    ReactNativeWebView?: { postMessage(message: string): void };
}

/** Whether this page runs inside the app's WebView, which defines this before the page's scripts. */
export const isInApp = (): boolean =>
    typeof window !== 'undefined' && !!(window as unknown as NativeWindow).ReactNativeWebView;

/**
 * The WebView's channel. The app posts on `window` on iOS and on `document` on Android, so both are
 * heard; each message arrives on one of them, once. Anything that is not a string is someone else's
 * message — other scripts and frames post too — and is dropped here.
 */
export const nativeTransport = (): Transport => ({
    send: message => (window as unknown as NativeWindow).ReactNativeWebView?.postMessage(message),
    listen: listener => {
        const onMessage = (event: Event) => {
            const data = (event as MessageEvent).data;
            if (typeof data === 'string') listener(data);
        };
        window.addEventListener('message', onMessage);
        document.addEventListener('message', onMessage);
        return () => {
            window.removeEventListener('message', onMessage);
            document.removeEventListener('message', onMessage);
        };
    },
});
