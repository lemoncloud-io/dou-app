# The sub WebView protocol

> `protocolVersion` 1, `BRIDGE_VERSION` 2.15.0. What is marked **(2.15.0)** arrived with that bridge
> version; an app built before it lacks it, which a page learns from the handshake rather than from a
> version number.

What a page shown in the sub WebView and the shell say to each other, stated as rules. The shell
side is this app; the page side is whatever runs on an allowlisted origin, normally through
`chatic-apps-sdk`, the library page authors will use instead of speaking this protocol by hand. Both sides
are held to this document: the SDK may hide it from authors, but it may not disagree with it.

What the sub WebView is, where it may go and how it closes are in [sub-webview.md](./sub-webview.md).
This document covers only the conversation.

The words **MUST**, **MUST NOT**, **SHOULD** and **MAY** are used in their usual sense: a page or a
shell that breaks a MUST is wrong, one that ignores a SHOULD needs a reason.

## Terms

| Term          | Meaning                                                                             |
| ------------- | ----------------------------------------------------------------------------------- |
| page          | The document loaded in the sub WebView, on an allowlisted origin                    |
| opened origin | The origin of the URL the view was opened on — the only one the shell answers       |
| shell         | The native app hosting the view                                                     |
| host          | The sub WebView's own `AppBridgeHost`, one per page load                            |
| opener        | The main web, which asked for the view with `OpenSubWebView` and hears its close    |
| request       | A message from the page that the host answers once                                  |
| reply         | The host's answer to one request, matched by `refId`                                |
| push          | A message from the host that answers no request                                     |
| subset        | The requests the host answers: `SubWebViewRequestType` in `@chatic/bridge-messages` |

## Versions

Three version values travel, and only one of them decides anything.

| Value                                               | What it is                                                | Decides                                                    |
| --------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| `supportedWebMessages` in the handshake reply       | The requests this host answers                            | **Everything a page may send.** The only capability signal |
| `ChaticSubWebView.protocolVersion` (an integer)     | This protocol's major version. 1 today                    | Whether the page understands the shell at all              |
| `BRIDGE_VERSION` (semver, shared with the main web) | The version of the message vocabulary both WebViews speak | Nothing at run time; it dates a change                     |

- **`protocolVersion` changes only on a breaking change** (see [Compatibility](#compatibility)). A
  page MUST refuse to run against a major it does not know, and SHOULD show the user that the app
  needs updating. A new request or field is not breaking and does not change it.
- **A page MUST decide what to send from `supportedWebMessages`, never from a version number.** An
  app built before a request answers `NOT_FOUND`; the handshake lists only what this host has a
  handler for, so a request it lists is one it answers.
- **A page SHOULD send its `BRIDGE_VERSION` as the envelope's `version`.** The host copies it into
  the reply and its logs and makes no decision on it.
- **The handshake reply's `appVersion` is the shell's `BRIDGE_VERSION`, not the app's version.** The
  name predates this protocol and is kept for the main web. The app's version is the context's
  `appVersion`.
- **The handshake reply's `protocolVersion` is not the major either.** It is the request's
  `version` echoed back, a semver string such as `2.15.0`. A page MUST check the major against the
  context's `protocolVersion`, never against the reply's field of the same name.

## Transport

Every message is a JSON string.

- **Page → shell:** `window.ReactNativeWebView.postMessage(JSON.stringify(message))`.
- **Shell → page:** a `message` event whose `data` is the JSON string. It is dispatched on `window` on
  iOS and on `document` on Android. A page MUST listen on both; each message arrives on one of them,
  once.
- A page MUST ignore a `message` event whose `data` is not a string or does not parse to an object
  with a string `type`. Other scripts and frames post messages too.
- Messages are not queued on the shell side: requests run concurrently, and two replies MAY arrive in
  a different order from their requests.

## Envelope

### Request

```json
{ "type": "SetSubWebViewTitle", "data": { "title": "Quiz" }, "refId": "k3j9x2", "version": "2.15.0" }
```

| Field     | Rule                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| `type`    | MUST be a request name                                                                                                    |
| `data`    | MUST be an object; `{}` for a request with no payload                                                                     |
| `refId`   | MUST be a string unique among this page load's pending requests. A request without one gets a reply the page cannot match |
| `version` | SHOULD be the page's `BRIDGE_VERSION`                                                                                     |

### Reply

A reply carries the request's `refId` and `success`. **A page MUST match a reply to its request by
`refId`, and MUST read the outcome from `success` and `error.code` alone** — not from `type`, which
takes one of two shapes on failure:

```json
{ "type": "OnSetSubWebViewTitle", "success": true, "data": {}, "refId": "k3j9x2", "version": "2.15.0" }
```

```json
{ "type": "OnSetSubWebViewTitle", "success": false, "error": { "code": "INVALID", "message": "…" }, "refId": "k3j9x2" }
```

```json
{
    "type": "ERROR",
    "success": false,
    "refId": "k3j9x2",
    "error": { "code": "NOT_FOUND", "message": "…", "traceId": "…", "requestType": "…", "recoverable": true }
}
```

- A refusal by the request's own handler has `type` `On<Request>` and `error: { code, message }`.
- A refusal by the host itself — no handler (`NOT_FOUND`), a handler that threw (`INTERNAL_ERROR`), a
  message over the size limit (`TOO_LARGE`, 2.15.0) — has `type` `ERROR` and more fields in `error`,
  which a page MAY log and MUST NOT depend on.
- `Ping` is answered with `type` `Pong`, not `OnPing`.
- `error.message` is English for a developer. A page MUST NOT show it to the user or branch on it.

### Push

A push has `type`, `success: true`, `data` and a `refId` the host made up, which matches no request.
A page MUST treat any message whose `refId` matches no pending request as a push, route it by
`type`, and ignore a `type` it does not know.

## Handshake

1. The page sends `WebAppReady` with `data: {}` before any other request.
2. The host answers `OnWebAppReady`:

    | Field                  | Meaning                                                                |
    | ---------------------- | ---------------------------------------------------------------------- |
    | `supportedWebMessages` | The subset this host answers                                           |
    | `supportedAppMessages` | The replies paired with them. Pushes are not listed                    |
    | `appVersion`           | The shell's `BRIDGE_VERSION` (see [Versions](#versions))               |
    | `protocolVersion`      | The request's `version`, echoed                                        |
    | `subWebView`           | **(2.15.0)** The same `SubWebViewContext` as `window.ChaticSubWebView` |

3. The host holds every push until the page's first message, then sends them in order. Any message
   but `SendLog` releases them, not only `WebAppReady`; a page that sends something first may receive
   pushes before it has the handshake's answer.

**(2.15.0) The handshake reply carries the context.** On Android, `window.ChaticSubWebView` can be
defined after the page's first script runs, so a page that reads it early finds nothing and cannot
tell "not yet" from "not in the app". The reply arrives at a known moment, so a page SHOULD take the
context from the reply and nowhere else. When the reply has no `subWebView` (an app before 2.15.0),
the page reads the global after its `load` event.

**Whether the page is in the app at all** is `window.ReactNativeWebView`, which the WebView defines
before any script of the page runs. A page that finds none is in a browser tab: it has no bridge, no
context and no `params`. A page that finds one but gets no handshake reply was navigated to from the
opened origin, and is not answered (see [Timing](#timing)).

## Context

`window.ChaticSubWebView`, and from 2.15.0 the handshake's `subWebView`, is a frozen
`SubWebViewContext`:

| Field             | Type                 | Meaning                                                         |
| ----------------- | -------------------- | --------------------------------------------------------------- |
| `protocolVersion` | `1`                  | This protocol's major version                                   |
| `viewId`          | string               | The view; opaque to the page                                    |
| `platform`        | `'ios' \| 'android'` | The OS                                                          |
| `appVersion`      | string               | The app's own version (`0.31.0`)                                |
| `locale`          | string               | The language the user chose in the app (`ko`, `en`)             |
| `theme`           | `'light' \| 'dark'`  | The app's resolved theme, which can differ from the OS's        |
| `params`          | object               | What the opener passed, `{}` when nothing; JSON, at most 16 KiB |

- It is defined only on the opened origin. A page the view navigated to finds nothing, even on
  another allowlisted origin.
- It holds nothing that identifies the device, the install or the user. A later change of `theme` or
  `locale` arrives as `OnSubWebViewContextChanged`; the global keeps its first values.

## Timing

**A reply can take as long as the user does.** `OpenShareSheet` answers when the sheet closes.
A page MUST NOT time out a request that waits on the user.

**Every other request SHOULD time out**, after 10 seconds by default. Some requests get no reply at
all, by design:

- a message from a frame or a page that is not on the opened origin;
- a message that is not JSON or has no string `type`;
- a request sent after the view started to close.

**A page MUST hold its timeouts while `document.visibilityState` is `hidden`.** On Android the shell
cannot deliver anything to the page while the app is in the background: a reply built then reaches
the page only when the user returns, all at once. The page keeps running meanwhile — its timers fire
and its requests still reach the host — so a timeout that counts through the wait fails a request
that succeeded. The main web's client does the same; its reasoning and measurements are in
[`libs/bridges`' README, scenario 7](../../../../libs/bridges/README.md#7-another-app-in-front-of-this-one).

## Limits

| What                                         | Limit                               | Over it                 |
| -------------------------------------------- | ----------------------------------- | ----------------------- |
| One message from the page, serialized        | **(2.15.0)** 64 KiB (string length) | `TOO_LARGE`, as `ERROR` |
| `params` (from the opener), `result` (to it) | 16 KiB serialized, JSON only        | `INVALID`               |
| Title in the bar                             | 1–100 characters after trimming     | `INVALID`               |
| Share sheet title / message / link           | 100 / 4,000 / 2,048 characters      | `INVALID`               |

Lengths are string lengths (UTF-16 code units), not bytes.

## Errors

A page MUST treat a code it does not know as a failure of that request and nothing more.

| Code                    | Raised by                   | Meaning                                                              |
| ----------------------- | --------------------------- | -------------------------------------------------------------------- |
| `NOT_FOUND`             | the host                    | The request is not in this host's subset. Expected from an older app |
| `INTERNAL_ERROR`        | the host                    | A handler failed unexpectedly. Retrying MAY work                     |
| `TOO_LARGE`             | the host **(2.15.0)**       | The message is over 64 KiB                                           |
| `INVALID`               | most requests               | A field is missing, of the wrong type, or over its limit             |
| `INVALID_KIND`          | `TriggerHaptic`             | `kind` is not one of the listed values                               |
| `NOT_OPEN`              | `FinishSubWebView`          | The view already closed                                              |
| `LINK_NOT_ALLOWED`      | `OpenURL`, `OpenShareSheet` | The link is not one this request may open or share                   |
| `OPEN_URL_FAILED`       | `OpenURL`                   | The OS could not open an allowed link                                |
| `CLIPBOARD_WRITE_ERROR` | `CopyToClipboard`           | The OS refused the write                                             |
| `SHARE_ERROR`           | `OpenShareSheet`            | The OS share sheet failed                                            |
| `UNAVAILABLE`           | `GetSubWebViewUserKey`      | The device has no id to derive a key from                            |

`INVALID_KIND` is `INVALID` under an older name; it stays, since renaming a code breaks a page that
reads it. The codes are `SubWebViewPageErrorCode` in `@chatic/bridge-messages` **(2.15.0)**.

## Requests

Each request's reply is `On<Request>` unless stated. Only the fields listed are read; anything else
in `data` is ignored.

### `WebAppReady`, `Ping`

`WebAppReady` is the [handshake](#handshake). `Ping { payload: string }` is answered `Pong { payload }`
by the host itself.

### `FinishSubWebView`

Close this view and hand `result` to the opener.

| Request                      | Reply | Errors                |
| ---------------------------- | ----- | --------------------- |
| `{ result?: JSON ≤ 16 KiB }` | `{}`  | `INVALID`, `NOT_OPEN` |

The opener receives `OnSubWebViewClosed { viewId, reason: 'page', result }`. The page SHOULD expect
to stop running soon after the reply, possibly before it is delivered.

### `SetSubWebViewTitle`

| Request             | Reply | Errors    |
| ------------------- | ----- | --------- |
| `{ title: string }` | `{}`  | `INVALID` |

The bar shows, in order of precedence: the title set here, the document's `<title>`, the opener's
`title`. A title set here lasts until the next page load in the view.

### `CopyToClipboard`

| Request            | Reply              | Errors                             |
| ------------------ | ------------------ | ---------------------------------- |
| `{ text: string }` | `{ copied: true }` | `INVALID`, `CLIPBOARD_WRITE_ERROR` |

### `TriggerHaptic`

| Request                             | Reply | Errors         |
| ----------------------------------- | ----- | -------------- |
| `{ kind: 'selection' \| 'impact' }` | `{}`  | `INVALID_KIND` |

The OS honours the user's own touch-feedback setting; a reply does not mean the device moved.

### `OpenURL`

| Request           | Reply | Errors                                |
| ----------------- | ----- | ------------------------------------- |
| `{ url: string }` | `{}`  | `LINK_NOT_ALLOWED`, `OPEN_URL_FAILED` |

Opens only what the view would itself hand to the OS: an `https` or `http` page off the allowlist,
`mailto:`, `tel:`, `sms:`, `itms-apps:`, `market:`. The app's own links and schemes, another sub
WebView page, and anything else answer `LINK_NOT_ALLOWED` — as does a `url` that is not a string.
To show an allowlisted page, navigate to it.

### `OpenShareSheet`

| Request                                              | Reply                                                                           | Errors                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------- |
| `{ title?: string, message?: string, url?: string }` | `{ action: 'sharedAction' \| 'dismissedAction', activityType: string \| null }` | `INVALID`, `LINK_NOT_ALLOWED`, `SHARE_ERROR` |

- There MUST be a `message` that is not blank, or a `url`. `null` counts as absent.
- `url` MUST be `http:` or `https:`. The app's own links are allowed: the link is shared, not opened.
- Android shows `title` as a subject to the receiving app and appends `url` to the message; iOS
  ignores `title`.
- Android replies `sharedAction` when the chooser opens, whatever the user then does, and never an
  `activityType`. Only iOS reports `dismissedAction` and the activity chosen.
- The reply waits for the user: no timeout (see [Timing](#timing)).

### `GetSubWebViewUserKey`

| Request | Reply             | Errors        |
| ------- | ----------------- | ------------- |
| `{}`    | `{ key: string }` | `UNAVAILABLE` |

`key` is 64 lower-case hex characters: the same on the same device and origin every time, different
on every other origin. It is not the DoU account and proves nothing — whoever learns one can send it.
How it is derived, how long it lasts and what it is not are in
[sub-webview.md](./sub-webview.md#what-the-page-gets-and-what-it-does-not).

### `SetCanGoBack` (2.15.0)

| Request                  | Reply | Errors    |
| ------------------------ | ----- | --------- |
| `{ canGoBack: boolean }` | `{}`  | `INVALID` |

The page claims Android's back button. While the claim is `true`, a back press is pushed to the page
as `OnBackPressed` and does nothing else; see [Back](#back-android). The claim ends at the next page
load. iOS has no back button and ignores the claim; its edge swipe goes back in the view's history.

### `SetSubWebViewCloseGuard` (2.15.0)

| Request                | Reply | Errors    |
| ---------------------- | ----- | --------- |
| `{ enabled: boolean }` | `{}`  | `INVALID` |

While enabled, the user's close is asked of the page first; see [Closing](#closing). The guard ends
at the next page load.

## Pushes

| Push                                      | Data                               | When                                                                              |
| ----------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| `OnSubWebViewContextChanged`              | `{ theme, locale }`                | The app's theme or language changed while the view showed                         |
| `OnBackPressed` **(2.15.0)**              | `{}`                               | Android back, while the page's `SetCanGoBack` claim is `true`                     |
| `OnSubWebViewCloseRequested` **(2.15.0)** | `{ trigger: 'control' \| 'back' }` | The user asked to close while the guard is on: the bar's control, or Android back |

A page learns that a push can come from the request it pairs with: `OnBackPressed` from `SetCanGoBack`
in the handshake, `OnSubWebViewCloseRequested` from `SetSubWebViewCloseGuard`.

## Lifecycle

### Opening

The opener sends `OpenSubWebView { url, title?, params? }`; the shell shows the view full screen
under a bar with the title and a close control, and the page loads. Each page load — the first, a
reload, a navigation — gets a fresh host, and the previous load's claims (title, back, close guard)
are gone: the shell drops them when a load starts, and a request the previous load sends after that
cannot set them again. A request the previous load left pending may still be answered, into the new
document: its `refId` matches nothing there and its `type` is a reply's, not a push's, so a page that
follows [Push](#push) ignores it.

**A page MUST set its claims again after its handshake and on every `pageshow`.** The shell drops
them when a load starts, and the page cannot always tell that one did: a document restored from the
back-forward cache keeps its script state but its claims are gone, and a navigation that starts and
never commits (a link that turns out to be a download) leaves the old page on screen with its claims
dropped. Setting a claim again is harmless; `chatic-apps-sdk` does it for the page.

### Closing

| Reason   | Who                                                              | Guarded **(2.15.0)** |
| -------- | ---------------------------------------------------------------- | -------------------- |
| `user`   | The bar's control, or Android back with nothing else to do       | Yes                  |
| `page`   | The page, with `FinishSubWebView`                                | No                   |
| `host`   | The opener, with `CloseSubWebView`                               | No                   |
| `system` | The shell, before a deep link or a tapped push navigates the app | No                   |

The opener hears every close as `OnSubWebViewClosed { viewId, reason, result? }`, except when the
opener itself reloaded under the view: then the view goes with no event.

**(2.15.0) The close guard.** While a page has the guard on, a `user` close does not close: the shell
pushes `OnSubWebViewCloseRequested` and waits. The page then either closes with `FinishSubWebView`
(and MAY hand a `result`), or does nothing and stays. A second close by the user within 3 seconds of
the first closes the view as `user` without asking, so a page that hangs or never answers cannot keep
the user in; a close after those 3 seconds asks the page again. The guard is for a page with something to lose — an unsaved form, a game in progress —
and a page MUST NOT turn it on for anything else.

`page`, `host` and `system` closes are never guarded and give the page no notice: the view is gone
when the shell decides. A page MUST keep anything it cannot lose saved as it goes, and SHOULD save
on `visibilitychange` to `hidden` (below).

### Back (Android)

A back press is decided in order:

1. **(2.15.0)** The page's `SetCanGoBack` claim is `true`: push `OnBackPressed` and stop. The page
   closes its own dialog, or navigates, or calls `SetCanGoBack(false)` and lets the next press through.
2. The view has history: go back in it.
3. Otherwise: close as `user` — through the close guard if it is on.

The press never reaches the main web underneath. A claim cannot trap the user: the bar's close
control is always there.

### Background

The shell sends no push when the app goes to the background or returns. **A page MUST use
`document.visibilitychange`** (and MAY use `pagehide`), which fires inside the page itself. A push
would be useless on Android: nothing reaches the page while the app is in the background, so a
"going to background" message would arrive only after the user came back. That the event fires on
Android is measured; on iOS it is not yet checked on a device (see the last section).

## Layout

**(2.15.0) The page's viewport lies inside the safe area on every edge.** The shell pads the view by
the device's insets on all four sides — top and bottom under the bar and above the home indicator,
left and right in landscape — and fills the padding with the app's theme background. A page needs no
inset handling; `env(safe-area-inset-*)` is expected to read 0 in the view, which is not yet checked
on a device (see the last section). (Before 2.15.0 the shell padded only top and bottom, so in
landscape a notch could cover the page's side.)

A page cannot draw behind the bar, the status bar or the home indicator. A full-bleed mode is not
part of this protocol.

## Security invariants

These hold in every version; a change that breaks one is not a protocol change but a different
feature, and needs its own decision.

- **The host answers only the opened origin.** A message from another origin, a frame on one, or a
  page the view navigated to gets no reply.
- **Nothing the page receives identifies the device, the install or the DoU user**: not the device id,
  not a value that maps to it one to one (a plain hash of it included), not the account. The device
  id is treated as a credential, not only as an identifier: DoU's own sign-in relies on it. The one identifier a page gets, the user key, is an HMAC over the page's origin
  keyed by the device id: one-way, and different on every origin.
- **The page cannot reach the opener** except through `params` in and `result` out, and cannot drive
  the app's routing: the app's own links are dropped or refused.
- **Every request is answered by a handler written for the sub WebView**, never one borrowed from the
  main WebView, whose handlers assume the main web is asking.

## Compatibility

Within a `protocolVersion`:

- A request, a push, a reply field, a context field or an error code MAY be added. A new request
  field MUST be optional, and its absence MUST mean what the request meant before.
- Nothing is removed or renamed, and no field changes its meaning or type. A request leaves the
  subset only with a new `protocolVersion`.
- A page MUST ignore fields and pushes it does not know, and MUST decide what to send from
  `supportedWebMessages`.

A breaking change raises `protocolVersion`. The shell then serves the new major; whether it also
keeps the old one for a while is decided with that change.

## What this protocol does not provide

| Not provided                                                | Instead                                                                |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| Notice before a `page`, `host` or `system` close            | Save as you go; `visibilitychange`                                     |
| A background or foreground push                             | `visibilitychange`                                                     |
| Safe-area insets                                            | Not needed: the viewport is inside the safe area                       |
| Drawing behind the bar or system bars                       | —                                                                      |
| Talking to the opener while open                            | `params` and `result`                                                  |
| Storage in the app, files, purchases, push                  | The page's own server, keyed by `GetSubWebViewUserKey`                 |
| Proof to the page's server that a request came from the app | Not yet: a token the app signs would need a key and a way to verify it |
| A popup login answering through `window.opener`             | A redirect login in the same view                                      |

## Not yet checked on a device

These follow from how WebKit and the Android WebView are documented to behave, and from the unit
tests, but have not been watched on a device:

- that iOS WKWebView reports `visibilitychange` to `hidden` when the app goes to the background
  (Android's is measured: the main web's client depends on it);
- that `env(safe-area-inset-*)` reads 0 in the padded view, in portrait and in landscape, on both
  platforms;
- that a focused input near the bottom of the page stays above the keyboard in the padded view on
  Android, which runs edge to edge.
