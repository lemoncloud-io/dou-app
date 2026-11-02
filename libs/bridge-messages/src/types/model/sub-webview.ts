// --- Sub WebView Types ---
//
// A second WebView the shell shows over the app's own, for a page on another origin. The web asks
// for it with a URL; the shell shows it full screen with its own close control and tells the web
// when it is gone.
//
// The shell opens only a subdomain of its own allowlisted domains (`*.apps.chatic.io`), which the
// app's review pipeline alone deploys to — never the web app's own origin, which would boot a second
// copy of the app beside the first. A link inside the page that leaves the allowlist goes to the OS
// browser instead, and one into the app's own routing is dropped.
//
// The page talks to the shell through a bridge of its own: a second host that registers only
// `SubWebViewRequestType` — a few messages from this same vocabulary — and answers only the origin
// the view was opened on. It never reaches the web that opened it, except through `params` going in
// and `result` coming out.
//
// One sub WebView at a time. The reply to `OpenSubWebView` arrives once the shell has started to
// show it, not when it closes; the close arrives as `OnSubWebViewClosed`.
//
// `params` and `result` are JSON, each at most 16 KiB once serialized. A page title is at most 100
// characters.
//
// Failures use the envelope's `error.code`:
// - `INVALID`: a missing or malformed field, a URL that is not `https`, data over its size limit or
//   not JSON.
// - `NOT_ALLOWED`: the URL is not on the shell's allowlist, or could be read two ways (userinfo,
//   a port, a backslash, whitespace).
// - `ALREADY_OPEN`: a sub WebView is already showing.
// - `NOT_OPEN`: the view named (or the page's own view) is not showing (it closed already).
//
// The web ships before the app: a shell without these handlers answers `NOT_FOUND`, and the web
// learns that from the handshake's `supportedWebMessages` before it asks. A page learns the same
// from its own handshake.

/** The error codes the sub WebView messages fail with. */
export type SubWebViewErrorCode = 'INVALID' | 'NOT_ALLOWED' | 'ALREADY_OPEN' | 'NOT_OPEN';

/**
 * Why a sub WebView closed:
 * - `user` — its close control, or Android back with no page to go back to;
 * - `host` — the web asked with `CloseSubWebView`;
 * - `system` — the shell closed it to take the user elsewhere (a deep link, a tapped push);
 * - `page` — the page closed itself with `FinishSubWebView`, and may hand back a `result`.
 */
export type SubWebViewCloseReason = 'user' | 'host' | 'system' | 'page';

/** A JSON object: what the web hands a page as `params`. */
export type SubWebViewParams = { [key: string]: unknown };

/** The theme a page should draw in: the app's resolved one, which may differ from the OS's. */
export type SubWebViewTheme = 'light' | 'dark';

/**
 * What the shell defines as `window.ChaticSubWebView` before the page's own scripts run, on the
 * origin the view was opened on only. Nothing that identifies the device, the install or the user.
 * It is a snapshot: a later theme or language change arrives as `OnSubWebViewContextChanged`.
 */
export type SubWebViewContext = {
    /** This page-facing contract's own version. */
    protocolVersion: 1;
    viewId: string;
    platform: 'ios' | 'android';
    /** The app's version, for a page that needs to know what the app can do. */
    appVersion: string;
    /** The app's language as the user chose it (`ko`, `en`). */
    locale: string;
    theme: SubWebViewTheme;
    /** What the web passed in `OpenSubWebView`; `{}` when it passed nothing. */
    params: SubWebViewParams;
};

/** [Request] Show `url` in a sub WebView over the app. */
export type OpenSubWebViewPayload = {
    /** An `https` URL on the shell's allowlist. */
    url: string;
    /** What the shell's bar shows until the page has a title of its own. */
    title?: string;
    /** Handed to the page as `window.ChaticSubWebView.params`, not in the URL. */
    params?: SubWebViewParams;
};

/** [Response] The sub WebView is showing. */
export type OnOpenSubWebViewPayload = {
    /** Names this view in `CloseSubWebView` and `OnSubWebViewClosed`. */
    viewId: string;
};

/** [Request] Close the sub WebView the web opened. */
export type CloseSubWebViewPayload = {
    viewId: string;
};

/** [Response] The sub WebView closed. Its `OnSubWebViewClosed` (`host`) was sent before this reply. */
export type OnCloseSubWebViewPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/**
 * [Event] A sub WebView closed. Sent once per view, for every reason in `SubWebViewCloseReason`.
 * Not sent when the web itself reloaded while the view was showing: the page that opened it is gone,
 * so the shell closes the view without telling the page that replaced it.
 */
export type OnSubWebViewClosedPayload = {
    viewId: string;
    reason: SubWebViewCloseReason;
    /** What the page handed back with `FinishSubWebView`; only with `reason: 'page'`. */
    result?: unknown;
};

/** [Request, from a sub WebView page] Close this view, handing `result` to the web that opened it. */
export type FinishSubWebViewPayload = {
    /** JSON, at most 16 KiB. */
    result?: unknown;
};

/** [Response] The view is closing. The page will not run much longer. */
export type OnFinishSubWebViewPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Request, from a sub WebView page] Show `title` in the shell's bar, over the document's own. */
export type SetSubWebViewTitlePayload = {
    /** 1–100 characters. */
    title: string;
};

/** [Response] The bar shows the title. */
export type OnSetSubWebViewTitlePayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Event, to a sub WebView page] The app's theme or language changed while the view showed. */
export type OnSubWebViewContextChangedPayload = Pick<SubWebViewContext, 'theme' | 'locale'>;
