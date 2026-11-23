export const SUB_WEBVIEW_SERVER_READS = { minIntervalMs: 250, perMinute: 60 } as const;

export const SUB_WEBVIEW_MESSAGE_SENDS = { minIntervalMs: 500, perMinute: 30 } as const;

export const SUB_WEBVIEW_CACHE_READS = { minIntervalMs: 0, perMinute: 600 } as const;

export const SUB_WEBVIEW_REACTIONS = { minIntervalMs: 250, perMinute: 60 } as const;

const MINUTE_MS = 60_000;

export interface SubWebViewReadBudget {
    take(now: number): { ok: true } | { ok: false; retryAfterMs: number };
}

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
