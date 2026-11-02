import type { SubWebViewCloseReason, SubWebViewErrorCode } from '@chatic/bridge-messages';

/** The sub WebView that is showing. */
export interface SubWebViewEntry {
    viewId: string;
    url: string;
    title?: string;
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
    | { type: 'closed'; viewId: string; reason: SubWebViewCloseReason; notifyHost: boolean };

export interface ISubWebViewService {
    /** The view that is showing, or `null`. */
    current(): SubWebViewEntry | null;
    /** Validate `url` against the allowlist and record a new view. */
    open(request: { url: unknown; title?: unknown }): SubWebViewOpenResult;
    /** Close the view named `viewId`; `NOT_OPEN` when it is not the one showing. */
    close(viewId: unknown, reason: SubWebViewCloseReason): SubWebViewCloseResult;
    /** The web that opened the view reloaded: dismiss it without telling the new page. */
    resetForNewHost(): void;
    subscribe(listener: (event: SubWebViewEvent) => void): () => void;
}
