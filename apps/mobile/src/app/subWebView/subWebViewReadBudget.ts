/** How often one view may ask the server through the runtime. */
export const SUB_WEBVIEW_SERVER_READS = { minIntervalMs: 250, perMinute: 60 } as const;

const MINUTE_MS = 60_000;

export interface SubWebViewReadBudget {
    /** Spends one read at `now`, or answers how long until one is free. */
    take(now: number): { ok: true } | { ok: false; retryAfterMs: number };
}

/**
 * A view's budget of server reads: at most one per `minIntervalMs`, and `perMinute` in any 60 seconds.
 * One per view, not per page load, so a page cannot reset it by reloading. Reads of the device cache
 * never come here — the server is what a page could flood, and the user's own screens share it.
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
