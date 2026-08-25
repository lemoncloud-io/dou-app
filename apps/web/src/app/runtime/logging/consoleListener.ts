import { createConsoleListener, isNative, logHub } from '@chatic/bridges';

/**
 * The listener that prints — one of the three `apps/web` attaches to the hub.
 *
 * It lives here rather than in `libs/bridges` because it is a web sink, and
 * `apps/web` is what decides which of its listeners run. `setupBridgeLogger`
 * used to attach it as a side effect of wiring the native relay, which meant a
 * decision about console output was buried in a function about bridging.
 *
 * Exactly one console is live per run, and which one depends on the platform:
 *
 * - **Web standalone** — this one. There is no other.
 * - **Hybrid** — the app's. Every web entry is relayed across, so the app's
 *   console shows web and native logs on one timeline, which is the thing worth
 *   having. Printing on both sides would just double the cost.
 *
 * The exception is a dev build inside the WebView. `debug` is not relayed (it is
 * the highest-volume level and both durable sinks over there drop it), so the
 * app's console cannot show web `debug` — and this is the only place it can be
 * read. Release builds get no exception, so "one console per run" holds where it
 * costs anything.
 */
export interface ConsoleListenerOptions {
    /** Whether this is a development build. Release hybrid never prints here. */
    isDev: boolean;
}

export const attachConsoleListener = ({ isDev }: ConsoleListenerOptions): (() => void) => {
    if (isNative() && !isDev) return () => undefined;

    return logHub.subscribe(createConsoleListener());
};
