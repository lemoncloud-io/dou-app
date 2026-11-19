/** How often one view may ask the server through the runtime. */
export const SUB_WEBVIEW_SERVER_READS = { minIntervalMs: 250, perMinute: 60 } as const;

/**
 * How often one view may send a message: a person tapping, not a script — and well under what would
 * bury a room, since every member gets each one.
 */
export const SUB_WEBVIEW_MESSAGE_SENDS = { minIntervalMs: 500, perMinute: 30 } as const;

/**
 * How often one view may read the device cache — a cache read, a cache list, a stream opened over the
 * cache. No spacing between them: a page that opens reads a room, its members and its messages at
 * once, as DoU's own screens do. The ceiling is for a page that reads in a loop, which would hold the
 * app's own thread in serializing rows it then throws away.
 */
export const SUB_WEBVIEW_CACHE_READS = { minIntervalMs: 0, perMinute: 600 } as const;

/**
 * How often one view may set a reaction: a person tapping, as with a message. Every member of the room
 * sees each one, but it adds no row to read, so it is allowed twice as often as a message.
 */
export const SUB_WEBVIEW_REACTIONS = { minIntervalMs: 250, perMinute: 60 } as const;

const MINUTE_MS = 60_000;

export interface SubWebViewReadBudget {
    /** Spends one read at `now`, or answers how long until one is free. */
    take(now: number): { ok: true } | { ok: false; retryAfterMs: number };
}

/**
 * A view's budget of server reads — or, built with `SUB_WEBVIEW_MESSAGE_SENDS`, of messages sent: at
 * most one per `minIntervalMs`, and `perMinute` in any 60 seconds. One per view, not per page load, so
 * a page cannot reset it by reloading. Built with `SUB_WEBVIEW_CACHE_READS`, it is the view's budget of
 * device cache reads, kept apart from the server's: a page that reads its cache hard can still ask the
 * server, and the other way round.
 */
export const createSubWebViewReadBudget = ({
    minIntervalMs,
    perMinute,
}: { minIntervalMs: number; perMinute: number } = SUB_WEBVIEW_SERVER_READS): SubWebViewReadBudget => {
    const spent: number[] = [];
    return {
        take: now => {
            while (spent.length > 0 && now - spent[0] >= MINUTE_MS) spent.shift();
            const last = spent[spent.length - 1];
            if (last !== undefined && now - last < minIntervalMs) {
                return { ok: false, retryAfterMs: minIntervalMs - (now - last) };
            }
            if (spent.length >= perMinute) return { ok: false, retryAfterMs: MINUTE_MS - (now - spent[0]) };
            spent.push(now);
            return { ok: true };
        },
    };
};
