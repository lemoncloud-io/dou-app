// --- Sub WebView Types ---
//
// A second WebView the shell shows over the app's own, for a page on another origin. The web asks
// for it with a URL; the shell shows it full screen with its own close control and tells the web
// when it is gone. The page inside has no bridge: it cannot reach the app, the device or the web
// that opened it.
//
// The shell opens only a subdomain of its own allowlisted domains (`*.apps.chatic.io`), which the
// app's review pipeline alone deploys to — never the web app's own origin, which would boot a second
// copy of the app beside the first. A link inside the page that leaves the allowlist goes to the OS
// browser instead, and one into the app's own routing is dropped.
//
// One sub WebView at a time. The reply to `OpenSubWebView` arrives once the shell has started to
// show it, not when it closes; the close arrives as `OnSubWebViewClosed`.
//
// Failures use the envelope's `error.code`:
// - `INVALID`: a missing or malformed field, or a URL that is not `https`.
// - `NOT_ALLOWED`: the URL is not on the shell's allowlist, or could be read two ways (userinfo,
//   a port, a backslash, whitespace).
// - `ALREADY_OPEN`: a sub WebView is already showing.
// - `NOT_OPEN`: `CloseSubWebView` named a view that is not showing (it closed already).
//
// The web ships before the app: a shell without these handlers answers `NOT_FOUND`, and the web
// learns that from the handshake's `supportedWebMessages` before it asks.

/** The error codes the sub WebView messages fail with. */
export type SubWebViewErrorCode = 'INVALID' | 'NOT_ALLOWED' | 'ALREADY_OPEN' | 'NOT_OPEN';

/**
 * Why a sub WebView closed:
 * - `user` — its close control, or Android back with no page to go back to;
 * - `host` — the web asked with `CloseSubWebView`;
 * - `system` — the shell closed it to take the user elsewhere (a deep link, a tapped push);
 * - `page` — the page closed itself. Not sent yet: the page has no way to ask until it has a bridge.
 *
 * All four are declared now so a web build that switches on the reason handles every value an app
 * can send, including one from an app released after it.
 */
export type SubWebViewCloseReason = 'user' | 'host' | 'system' | 'page';

/** [Request] Show `url` in a sub WebView over the app. */
export type OpenSubWebViewPayload = {
    /** An `https` URL on the shell's allowlist. */
    url: string;
    /** What the shell's bar shows until the page has a title of its own. */
    title?: string;
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
};
