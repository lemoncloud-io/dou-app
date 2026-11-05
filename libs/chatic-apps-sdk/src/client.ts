import { ChaticAppsError } from './errors';
import type { Transport } from './transport';

/** The bridge version this library is written against, sent as each request's `version`. */
export const SDK_BRIDGE_VERSION = '2.20.0';

/** How long a request waits for its reply by default, while the page is visible. */
export const DEFAULT_TIMEOUT_MS = 10_000;

/** After the page shows again, a held request gets at least this long for its reply to land. */
const RESUME_GRACE_MS = 2_000;

type Incoming = {
    type?: unknown;
    refId?: unknown;
    success?: unknown;
    data?: unknown;
    error?: { code?: unknown; message?: unknown };
};

interface Pending {
    resolve(data: unknown): void;
    reject(error: ChaticAppsError): void;
    /** `null` for a request with no timeout. */
    remaining: number | null;
    startedAt: number;
    timer: ReturnType<typeof setTimeout> | null;
}

export interface RequestOptions {
    /** `null` waits as long as the user does (a share sheet). */
    timeoutMs?: number | null;
}

export interface BridgeClient {
    /** Sends a request and settles with its reply's `data`, or rejects with its `error.code`. */
    request<T = unknown>(type: string, data?: object, options?: RequestOptions): Promise<T>;
    /** Hears every push of `type`; returns the function that stops it. */
    onPush(type: string, listener: (data: unknown) => void): () => void;
    close(): void;
}

let sequence = 0;
const nextRefId = () => `cas-${Date.now().toString(36)}-${(++sequence).toString(36)}`;

const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

/**
 * The request/reply layer. A reply is matched by `refId` and judged by `success` and `error.code`
 * alone — never by `type`, which takes two shapes on failure. Anything whose `refId` matches nothing
 * pending is a push, routed by `type`; a type nobody listens for is ignored, which also drops a late
 * reply to a request from the previous page load.
 *
 * Timeouts stand still while the page is hidden: on Android the app cannot deliver anything to a page
 * in the background, so a reply built then lands only when the user comes back.
 */
export const createBridgeClient = (transport: Transport, defaultTimeoutMs = DEFAULT_TIMEOUT_MS): BridgeClient => {
    const pending = new Map<string, Pending>();
    const pushListeners = new Map<string, Set<(data: unknown) => void>>();
    let closed = false;

    const arm = (refId: string, entry: Pending) => {
        if (entry.remaining === null || hidden()) return;
        entry.startedAt = Date.now();
        entry.timer = setTimeout(() => {
            pending.delete(refId);
            entry.reject(new ChaticAppsError('TIMEOUT', 'The app did not answer in time.'));
        }, entry.remaining);
    };

    const onVisibility = () => {
        for (const [refId, entry] of pending) {
            if (entry.remaining === null) continue;
            if (hidden()) {
                if (entry.timer) clearTimeout(entry.timer);
                entry.timer = null;
                entry.remaining = Math.max(0, entry.remaining - (Date.now() - entry.startedAt));
            } else if (!entry.timer) {
                entry.remaining = Math.max(entry.remaining, RESUME_GRACE_MS);
                arm(refId, entry);
            }
        }
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);

    const stop = transport.listen(raw => {
        let message: Incoming;
        try {
            message = JSON.parse(raw);
        } catch {
            return;
        }
        if (!message || typeof message !== 'object' || typeof message.type !== 'string') return;
        const entry = typeof message.refId === 'string' ? pending.get(message.refId) : undefined;
        if (entry && typeof message.refId === 'string') {
            pending.delete(message.refId);
            if (entry.timer) clearTimeout(entry.timer);
            if (message.success === true) {
                entry.resolve(message.data);
            } else {
                const code = typeof message.error?.code === 'string' ? message.error.code : 'INTERNAL_ERROR';
                const text = typeof message.error?.message === 'string' ? message.error.message : code;
                entry.reject(new ChaticAppsError(code, text));
            }
            return;
        }
        // One listener that throws must not keep the push from the rest.
        pushListeners.get(message.type)?.forEach(listener => {
            try {
                listener(message.data);
            } catch {
                // The listener's own concern; the caller wraps what it registers.
            }
        });
    });

    return {
        request: (type, data = {}, options = {}) =>
            new Promise((resolve, reject) => {
                if (closed) {
                    reject(new ChaticAppsError('DISCONNECTED', 'The connection to the app was closed.'));
                    return;
                }
                const refId = nextRefId();
                const timeout = options.timeoutMs === undefined ? defaultTimeoutMs : options.timeoutMs;
                const entry: Pending = {
                    resolve: resolve as (data: unknown) => void,
                    reject,
                    remaining: timeout,
                    startedAt: Date.now(),
                    timer: null,
                };
                pending.set(refId, entry);
                arm(refId, entry);
                transport.send(JSON.stringify({ type, data, refId, version: SDK_BRIDGE_VERSION }));
            }),
        onPush: (type, listener) => {
            let listeners = pushListeners.get(type);
            if (!listeners) pushListeners.set(type, (listeners = new Set()));
            listeners.add(listener);
            return () => listeners?.delete(listener);
        },
        close: () => {
            if (closed) return;
            closed = true;
            stop();
            if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
            // Nothing would ever settle them: the replies can no longer arrive.
            for (const entry of pending.values()) {
                if (entry.timer) clearTimeout(entry.timer);
                entry.reject(new ChaticAppsError('DISCONNECTED', 'The connection to the app was closed.'));
            }
            pending.clear();
            pushListeners.clear();
        },
    };
};
