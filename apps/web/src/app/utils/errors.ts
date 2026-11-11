// Local error helpers. These were previously imported from `@chatic/web-core`,
// but that package no longer re-exports them from its public barrel. They are
// trivial, dependency-free utilities, so we keep an app-local copy.

/** Coerce an unknown thrown value into a real Error instance. */
export const toError = (e: unknown): Error => {
    if (e instanceof Error) return e;
    if (typeof Event !== 'undefined' && e instanceof Event) return new Error(describeEvent(e));
    return new Error(String(e));
};

/**
 * `String(event)` on a raw DOM Event collapses to the useless `[object Event]` — seen in production
 * as an `unhandledrejection` with exactly that message. Root cause: lemon-model's
 * `OwnedWebSocketNetwork` builds an internal "connection opened" promise per WebSocket attempt and
 * rejects it with the raw `error`/`close` event on failure, but nothing in chatic-sockets-lib ever
 * awaits that promise — `WebSocketTransport` drives its own reconnect off `onOpen`/`onError`
 * callbacks instead — so the rejection reaches `window` as a genuinely unhandled Event. Pull out
 * what the event actually carries so the report is diagnosable instead of opaque.
 */
const describeEvent = (event: Event): string => {
    // Duck-typed rather than `instanceof WebSocket`: works the same for the native browser
    // WebSocket, and does not depend on the global existing (it does not in every test/SSR
    // environment) or matching a specific WebSocket implementation.
    const target = event.target as { url?: unknown; readyState?: unknown; constructor?: { name?: string } } | null;
    if (typeof target?.url === 'string' && typeof target.readyState === 'number') {
        return `WebSocket ${event.type} event (url=${target.url}, readyState=${target.readyState})`;
    }
    return `${event.type} event on ${target?.constructor?.name ?? 'unknown target'}`;
};

/**
 * HTTP status carried by a rejected socket request, or `undefined` when the failure is unclassified.
 *
 * A numeric `errorCode` carried on the Error comes first. chatic-sockets-lib drops the `:error`
 * frame's `errorCode` when it rejects, and the runtime's `SocketManager` puts it back on every request
 * made through its facade — the only source of a status for a server answer whose message does not
 * begin with one (a parameter check, `@chatNo[999] is invalid - …`, is coded 400). Otherwise the
 * status is recovered from the message prefix, which is how the client's own failures are written
 * (`408 REQUEST TIMEOUT - …`, `503 SOCKET NOT CONNECTED - …`) and how a server message that does
 * begin with its status reads (`403 FORBIDDEN - …`).
 *
 * The runtime keeps the same parser (`libs/transport/src/socket/utils/socketErrorCode.ts`), and so
 * does desktop-web (`socketErrorStatus`); a change to one belongs in the others.
 *
 * This exists so callers branch on the code and never on the wording: server messages are not a
 * contract and are localized/reworded freely.
 */
export const getSocketErrorCode = (error: unknown): number | undefined => {
    const carried = (error as { errorCode?: unknown } | null)?.errorCode;
    if (typeof carried === 'number') return carried;

    const leadingStatus = /^\s*([1-5]\d{2})\b/.exec(toError(error).message);
    return leadingStatus ? Number(leadingStatus[1]) : undefined;
};

/** Reject if `promise` does not settle within `ms` milliseconds. */
export const withTimeout = <T>(promise: Promise<T>, ms: number, context = 'Operation'): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`TIMEOUT: ${context} timed out (${ms}ms)`)), ms);
        promise.then(
            value => {
                clearTimeout(timer);
                resolve(value);
            },
            error => {
                clearTimeout(timer);
                reject(error);
            }
        );
    });
};
