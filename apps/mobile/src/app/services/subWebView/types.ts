import type { SubWebViewCloseReason, SubWebViewErrorCode } from '@chatic/app-messages';

/** The sub WebView that is showing. */
export interface SubWebViewEntry {
    viewId: string;
    url: string;
    title?: string;
    /** What the web passed for the page; `{}` when it passed nothing. */
    params: Record<string, unknown>;
}

export type SubWebViewOpenResult = { ok: true; view: SubWebViewEntry } | { ok: false; code: SubWebViewErrorCode };

export type SubWebViewCloseResult = { ok: true } | { ok: false; code: SubWebViewErrorCode };

/**
 * What the service reports to its two listeners: the screen routing, which shows and dismisses the
 * view, and the main WebView's handler, which tells the web.
 *
 * `notifyHost` is false only when the web reloaded under the view: the page that opened it is gone,
 * so the view is dismissed without an `OnSubWebViewClosed` for the page that replaced it.
 */
export type SubWebViewEvent =
    | { type: 'opened'; view: SubWebViewEntry }
    | { type: 'closed'; viewId: string; reason: SubWebViewCloseReason; notifyHost: boolean; result?: unknown };

export interface ISubWebViewService {
    /** The view that is showing, or `null`. */
    current(): SubWebViewEntry | null;
    /** Validate `url` against the allowlist and `params` against the data limit, and record a new view. */
    open(request: { url: unknown; title?: unknown; params?: unknown }): SubWebViewOpenResult;
    /**
     * Close the view named `viewId`; `NOT_OPEN` when it is not the one showing, `INVALID` when
     * `result` is not JSON of at most 16 KiB.
     */
    close(viewId: unknown, reason: SubWebViewCloseReason, result?: unknown): SubWebViewCloseResult;
    /** The web that opened the view reloaded: dismiss it without telling the new page. */
    resetForNewHost(): void;
    subscribe(listener: (event: SubWebViewEvent) => void): () => void;
}
