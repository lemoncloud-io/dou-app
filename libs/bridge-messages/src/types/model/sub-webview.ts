// --- Sub WebView Types ---
//
// A second WebView the shell shows over the app's own, for a page on another origin. The web asks
// for it with a URL; the shell shows it with its own close control and tells the web when it is gone.
//
// What the shell opens, and how far it trusts it, is one of three tiers (the shared
// `subWebViewTrustOf` decides it for both shells):
// - `firstParty` — the hub, `https://apps.chatic.io` / `https://apps-dev.chatic.io` by exact origin;
// - `reviewed` — one label under those domains, which the app's review pipeline alone deploys to;
// - `external` — any other plain https site, which a cloud owner chose. It gets the base set only:
//   no manifest is fetched from it, and the bar always shows its host.
// Never the web app's own origin as a trusted page, which would boot a second copy of the app beside
// the first. A shell reports how far it opens in the handshake (`subWebViewOpenScope`): a phone shell
// that predates the tiers opens `reviewed` pages only and reports nothing.
//
// A link inside the page that leaves the origin it was opened on goes to the OS browser instead, and
// one into the app's own routing is dropped.
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
// - `NOT_ALLOWED`: the shell does not open the URL — outside what it opens, or a URL that could be
//   read two ways (userinfo, a port, a backslash, whitespace, an IP literal).
// - `ALREADY_OPEN`: a sub WebView is already showing.
// - `NOT_OPEN`: the view named (or the page's own view) is not showing (it closed already).
//
// The web ships before the app: a shell without these handlers answers `NOT_FOUND`, and the web
// learns that from the handshake's `supportedWebMessages` before it asks. A page learns the same
// from its own handshake.

/**
 * How far a shell's `OpenSubWebView` opens, reported in its handshake: `reviewed` — the hub and the
 * reviewed pages only; `anyHttps` — any plain https site as well, in the `external` tier. Absent from
 * shells that predate it, which open the reviewed pages only.
 */
export type SubWebViewOpenScope = 'reviewed' | 'anyHttps';

/**
 * What a page may use beyond the base set, by capability rather than by message name, declared in
 * its manifest. `clipboard` → `CopyToClipboard`, `share` → `OpenShareSheet`, `openUrl` → `OpenURL`,
 * `userKey` → `GetSubWebViewUserKey`. A request whose capability the page did not declare is not
 * registered, so its handshake does not list it and the host answers it `NOT_FOUND`.
 */
export type SubWebViewPermission = 'clipboard' | 'share' | 'openUrl' | 'userKey';

/** A device a page captures from with `getUserMedia`. */
export type SubWebViewDeviceKind = 'camera' | 'microphone';

/**
 * Where DoU stands with the OS for one device:
 * - `granted` — the OS allows DoU to use it: `getUserMedia` for it asks nothing further.
 * - `prompt` — the OS has not been asked, or was refused and may be asked again.
 * - `blocked` — the OS will not ask again; only the OS settings can change it (`OpenSettings`).
 */
export type SubWebViewDevicePermissionState = 'granted' | 'prompt' | 'blocked';

/**
 * `fullscreen`, the default, shows no bar and keeps a floating close control; `standard` shows the
 * shell's bar with the page's title and a close control.
 */
export type SubWebViewDisplay = 'standard' | 'fullscreen';

/** The orientation the view is held in; `any` follows the device. */
export type SubWebViewOrientation = 'any' | 'portrait' | 'landscape';

/**
 * A page's manifest, served from its own origin at `/.well-known/chatic-app.json`. The shell reads it
 * before it shows the page. With none, or one it cannot read, the page gets the base set only and
 * the standard display. Unknown fields are ignored; a known field with a wrong value is ignored too.
 */
export type SubWebViewManifest = {
    manifestVersion: 1;
    /** What the bar shows when nothing else names the page; 1–100 characters. */
    name?: string;
    permissions?: SubWebViewPermission[];
    display?: SubWebViewDisplay;
    orientation?: SubWebViewOrientation;
};

/** The error codes the sub WebView messages fail with. */
export type SubWebViewErrorCode = 'INVALID' | 'NOT_ALLOWED' | 'ALREADY_OPEN' | 'NOT_OPEN';

/**
 * Every `error.code` a sub WebView page can receive from its own host. A page still treats a code
 * it does not know as a failure of that request: codes are added, never renamed.
 *
 * - `NOT_FOUND`, `INTERNAL_ERROR`, `TOO_LARGE` come from the host itself, in a reply typed `ERROR`;
 *   `TOO_LARGE` is a message over the host's size limit (65,536 characters serialized).
 * - The rest come from a request's own handler, in a reply typed `On<Request>`. `INVALID_KIND` is
 *   `TriggerHaptic`'s older name for `INVALID`, kept because a page may read it.
 */
export type SubWebViewPageErrorCode =
    | 'NOT_FOUND'
    | 'INTERNAL_ERROR'
    | 'TOO_LARGE'
    | 'INVALID'
    | 'INVALID_KIND'
    | 'NOT_OPEN'
    | 'LINK_NOT_ALLOWED'
    | 'OPEN_URL_FAILED'
    | 'CLIPBOARD_WRITE_ERROR'
    | 'SHARE_ERROR'
    | 'UNAVAILABLE'
    | 'QUOTA_EXCEEDED'
    | 'SETTINGS_ERROR';

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
    platform: 'ios' | 'android' | 'desktop';
    /** The app's version, for a page that needs to know what the app can do. */
    appVersion: string;
    /** The app's language as the user chose it (`ko`, `en`). */
    locale: string;
    theme: SubWebViewTheme;
    /** What the web passed in `OpenSubWebView`; `{}` when it passed nothing. */
    params: SubWebViewParams;
    /**
     * The app link that opens this page: `https://app.chatic.io/apps/<appId>` for the `appId` the web
     * opened it with. A page shares `appLink` plus a query of its own, and a tap opens the page in
     * the app with that query, or offers the app where it is not installed. Opened without an
     * `appId` — by a web before 2.19.0 — the page's label stands in for it. Absent from apps before
     * 2.17.0.
     */
    appLink?: string;
};

/** [Request] Show `url` in a sub WebView over the app. */
export type OpenSubWebViewPayload = {
    /** An `https` URL the shell opens — see `subWebViewOpenScope`. */
    url: string;
    /** What the shell's bar shows until the page has a title of its own. */
    title?: string;
    /** Handed to the page as `window.ChaticSubWebView.params`, not in the URL. */
    params?: SubWebViewParams;
    /**
     * The app the web resolved `url` from: a page's `appLink` is built from it, so a link the page
     * shares names the app rather than where the app is hosted. One DNS label (`quiz`, `dou-raise`).
     * Ignored by apps before 2.19.0, which take the page's label instead.
     */
    appId?: string;
};

/**
 * The `params` DoU's own web hands a mini app: who is looking, in which cloud and place. Ids and
 * display names only — nothing that authenticates, and no key named for a token. `user.id` is the
 * user's id in that cloud, so a page sees a different id per cloud. `user.isOwner` and `miniApps` are
 * sent to the hub (`firstParty`) alone: the first for it to offer the cloud's owner the link settings,
 * the second for it to list the cloud's mini apps. A hub that wants one opened finishes with
 * `{ action: 'openMiniApp', id }`, and the web opens it.
 */
export type MiniAppLaunchParams = {
    cloud: { id: string; name: string };
    place: { id: string; name: string } | null;
    user: { id: string; name: string; isOwner?: boolean };
    /** The cloud's mini apps in the owner's order: a name and the host, never the address itself. */
    miniApps?: { id: string; name: string; host: string }[];
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

/**
 * [Request, from a sub WebView page] This device's key for this page's origin, for the page's own
 * server to keep the user's data under (a save game, progress) without an account.
 *
 * The shell derives it from the device id and the origin the view was opened on, so the same device
 * gets the same key on the same origin each time, and each origin gets a different key that cannot be
 * linked to another's or traced back to the device id. It is not the DoU account, and it is not proof
 * of anything: a page's server receives whatever the page sends it.
 *
 * Fails with `UNAVAILABLE` when the shell has no device id to derive it from.
 */
export type GetSubWebViewUserKeyPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] The key: 64 lower-case hex characters. */
export type OnGetSubWebViewUserKeyPayload = {
    key: string;
};

/**
 * [Request, from a sub WebView page] Ask the page before the user closes the view. While enabled, the
 * view's close control and an Android back press that would close it push
 * `OnSubWebViewCloseRequested` instead of closing; the page closes with `FinishSubWebView` or stays.
 * A second close by the user within a few seconds closes anyway, so a page cannot keep the user in.
 * Only the user's close is guarded: the web's `CloseSubWebView` and the shell's own close are not.
 * Lasts until the next page load in the view.
 */
export type SetSubWebViewCloseGuardPayload = {
    enabled: boolean;
};

/** [Response] The guard is set. */
export type OnSetSubWebViewCloseGuardPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** What the user did to ask for the close: the view's close control, or Android back. */
export type SubWebViewCloseTrigger = 'control' | 'back';

/** [Event, to a sub WebView page] The user asked to close the view while its close guard is on. */
export type OnSubWebViewCloseRequestedPayload = {
    trigger: SubWebViewCloseTrigger;
};

/**
 * [Request, from a sub WebView page] Record an error the page hit, in the app's own logs under the
 * page's origin, so a page that breaks on users' devices can be found and withdrawn. Text only, cut
 * to its limit rather than refused; at most 20 per page load, after which nothing is recorded.
 */
export type ReportSubWebViewErrorPayload = {
    /** At most 1,000 characters are kept. */
    message: string;
    /** At most 4,000 characters are kept. */
    stack?: string;
};

/** [Response] Whether the error was recorded; `false` once the page load has used its 20. */
export type OnReportSubWebViewErrorPayload = {
    recorded: boolean;
};

/**
 * A page's own storage, kept by the app for the page's origin: no other page can read or clear it, and
 * the origin is the app's record of where the view opened, never anything in a request. It belongs to
 * the device, like the user key — it stays across sign-outs and app restarts, and goes with the app.
 *
 * Values are JSON. What a page holds is counted as the characters of its keys and its values serialized,
 * up to 1,048,576 for the origin; a write that would go past it fails with `QUOTA_EXCEEDED` and changes
 * nothing. A key is 1–200 characters. Every request is in the base set: it reaches nothing but the
 * page's own data.
 */

/** [Request, from a sub WebView page] Read `keys`. */
export type GetSubWebViewStoragePayload = {
    keys: string[];
};

/** [Response] The stored values; a key with nothing stored is left out. */
export type OnGetSubWebViewStoragePayload = {
    entries: { [key: string]: unknown };
};

/** [Request, from a sub WebView page] Store each entry, all or none. */
export type SetSubWebViewStoragePayload = {
    entries: { [key: string]: unknown };
};

/** How much of its storage a page uses, in characters. */
export type SubWebViewStorageUsage = {
    used: number;
    limit: number;
};

/** [Response] Stored; how much is used now. */
export type OnSetSubWebViewStoragePayload = SubWebViewStorageUsage;

/** [Request, from a sub WebView page] Remove `keys`; a key with nothing stored is no error. */
export type RemoveSubWebViewStoragePayload = {
    keys: string[];
};

/** [Response] Removed; how much is used now. */
export type OnRemoveSubWebViewStoragePayload = SubWebViewStorageUsage;

/** [Request, from a sub WebView page] Remove everything this page stored. */
export type ClearSubWebViewStoragePayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] The page's storage is empty. */
export type OnClearSubWebViewStoragePayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Request, from a sub WebView page] What the page has stored: its keys and how much they use. */
export type GetSubWebViewStorageInfoPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] The page's keys, and its usage. */
export type OnGetSubWebViewStorageInfoPayload = SubWebViewStorageUsage & {
    keys: string[];
};

/**
 * A page captures with the WebView's own `getUserMedia`, and the OS asks the user under DoU's name.
 * These requests let a page learn where it stands first and ask when the user reaches for the feature,
 * rather than meet the OS prompt in the middle of a capture. They are in the base set: they reach no
 * more than `getUserMedia` already gives the page. The app does not limit a page's use of a device;
 * its author answers for it.
 *
 * Both fail with `INVALID` for an unknown kind and `UNAVAILABLE` when the device has no such hardware.
 */

/** [Request, from a sub WebView page] Where DoU stands with the OS for `kind`, showing nothing. */
export type GetSubWebViewPermissionPayload = {
    kind: SubWebViewDeviceKind;
};

/** [Response] The state for that kind. */
export type OnGetSubWebViewPermissionPayload = {
    state: SubWebViewDevicePermissionState;
};

/**
 * [Request, from a sub WebView page] Ask the OS for `kind`, showing its prompt if it has not been
 * answered. Answers once the user has decided.
 */
export type RequestSubWebViewPermissionPayload = {
    kind: SubWebViewDeviceKind;
};

/** [Response] The state once the user decided; `prompt` means refused this time and may be asked again. */
export type OnRequestSubWebViewPermissionPayload = {
    state: SubWebViewDevicePermissionState;
};
