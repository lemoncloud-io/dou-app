/** How long after the page was asked a second close by the user goes through without asking again. */
export const SUB_WEBVIEW_CLOSE_FORCE_WINDOW_MS = 3000;

export interface SubWebViewCloseGuard {
    /**
     * The page turned the guard on or off. A pending ask is kept: a page that re-sends `true` on
     * every request must not be able to restart the user's window and keep them in.
     */
    setEnabled(enabled: boolean): void;
    /**
     * The user asked to close at `now`: `close` to close the view, `ask` to push the request to the
     * page and leave the view open.
     */
    decide(now: number): 'close' | 'ask';
}

/**
 * One page load's close guard. The page decides whether the user's close is asked of it first; the
 * user decides how long to wait for an answer — a second close within the window always closes, so a
 * page that hangs, or never answers, cannot keep them in. A press after the window asks again: a page
 * showing its own "leave?" prompt by then has had its chance to answer the first one.
 */
export const createSubWebViewCloseGuard = (): SubWebViewCloseGuard => {
    let enabled = false;
    let askedAt: number | null = null;
    return {
        setEnabled(value) {
            enabled = value;
        },
        decide(now) {
            if (!enabled) return 'close';
            if (askedAt !== null && now - askedAt <= SUB_WEBVIEW_CLOSE_FORCE_WINDOW_MS) return 'close';
            askedAt = now;
            return 'ask';
        },
    };
};
