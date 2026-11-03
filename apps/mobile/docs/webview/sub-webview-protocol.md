# The sub WebView protocol

> `protocolVersion` 1, `BRIDGE_VERSION` 2.17.0. What is marked **(2.15.0)**, **(2.16.0)** or
> **(2.17.0)** arrived with that bridge version; an app built before it lacks it, which a page learns from the handshake
> rather than from a version number.

What a page shown in the sub WebView and the shell say to each other, stated as rules. The shell
side is this app; the page side is whatever runs on an allowlisted origin, normally through
[`chatic-apps-sdk`](../../../../libs/chatic-apps-sdk/README.md), the library page authors use
instead of speaking this protocol by hand. Both sides
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
| manifest      | The page's own declaration of what it needs, served from its origin (2.16.0)        |
| base set      | The requests every page gets, with or without a manifest                            |

## Versions

Three version values travel, and only one of them decides anything.

| Value                                               | What it is                                                | Decides                                                    |
| --------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| `supportedWebMessages` in the handshake reply       | The requests this host answers                            | **Everything a page may send.** The only capability signal |
| `ChaticSubWebView.protocolVersion` (an integer)     | This protocol's major version. 1 today                    | Whether the page understands the shell at all              |
| `BRIDGE_VERSION` (semver, shared with the main web) | The version of the message vocabulary both WebViews speak | Nothing at run time; it dates a change                     |

- **`protocolVersion` changes only on a breaking change** (see [Compatibility](#compatibility)). A
  page MUST refuse to run against a major it does not know, and SHOULD tell the user which side
  needs updating: the page, when the app's major is newer (its author updates `chatic-apps-sdk`), or
  the app, when it is older. A new request or field is not breaking and does not change it.
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
    | `supportedWebMessages` | What this host answers: the base set and what the manifest permits     |
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

| Field             | Type                 | Meaning                                                                                  |
| ----------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| `protocolVersion` | `1`                  | This protocol's major version                                                            |
| `viewId`          | string               | The view; opaque to the page                                                             |
| `platform`        | `'ios' \| 'android'` | The OS                                                                                   |
| `appVersion`      | string               | The app's own version (`0.31.0`)                                                         |
| `locale`          | string               | The language the user chose in the app (`ko`, `en`)                                      |
| `theme`           | `'light' \| 'dark'`  | The app's resolved theme, which can differ from the OS's                                 |
| `params`          | object               | What the opener passed, `{}` when nothing; JSON, at most 16 KiB                          |
| `appLink`         | string               | **(2.17.0)** The link that opens this page: see [Links to a page](#links-to-a-page-2170) |

- It is defined only on the opened origin. A page the view navigated to finds nothing, even on
  another allowlisted origin.
- It holds nothing that identifies the device, the install or the user. A later change of `theme` or
  `locale` arrives as `OnSubWebViewContextChanged`; the global keeps its first values.

## Manifest (2.16.0)

A page declares what it needs in a manifest, served from its own origin at
`/.well-known/chatic-app.json` — for `https://quiz.apps.chatic.io/`, at
`https://quiz.apps.chatic.io/.well-known/chatic-app.json`:

```json
{
    "manifestVersion": 1,
    "name": "DoU Quiz",
    "permissions": ["share", "userKey"],
    "display": "standard",
    "orientation": "portrait"
}
```

| Field             | Values                                                             | Without it                 |
| ----------------- | ------------------------------------------------------------------ | -------------------------- |
| `manifestVersion` | `1`                                                                | No manifest at all         |
| `name`            | 1–100 characters; the bar's title when nothing else names the page | No title from the manifest |
| `permissions`     | Any of `clipboard`, `share`, `openUrl`, `userKey`                  | The base set only          |
| `display`         | `standard` (the bar) or `fullscreen` (see [Layout](#layout))       | `standard`                 |
| `orientation`     | `any`, `portrait`, `landscape`                                     | `any`                      |

**Every page gets the base set**: `WebAppReady`, `Ping`, `FinishSubWebView`, `SetSubWebViewTitle`,
`TriggerHaptic`, `SetCanGoBack`, `SetSubWebViewCloseGuard`, `ReportSubWebViewError`. None of them
reaches anything outside the view. **The rest is declared**, one capability per request:

| Permission  | Unlocks                | Why it is declared                                        |
| ----------- | ---------------------- | --------------------------------------------------------- |
| `clipboard` | `CopyToClipboard`      | Writes over whatever the user had copied                  |
| `share`     | `OpenShareSheet`       | Hands text and a link to another app                      |
| `openUrl`   | `OpenURL`              | Leaves the app for the browser, mail, phone or a store    |
| `userKey`   | `GetSubWebViewUserKey` | A stable identifier the page's server can keep data under |

A request whose permission the page did not declare is not registered: the handshake does not list
it, and the host answers it `NOT_FOUND`, exactly as an app that predates it would. So a page decides
from `supportedWebMessages` as it already must, and a missing permission and an older app look alike.
**The author asks; an administrator grants.** A page is submitted as a bundle with its manifest, and
the permissions in it are a request. An administrator approves them when the bundle is reviewed, and
only what was approved is deployed: the manifest on an allowlisted origin is the grant, since nothing
but the review deploys there. The shell trusts that file and nothing else — it does not ask the page,
and a page cannot widen its permissions at run time.

**How the shell reads it:**

- Before it loads the page. The view shows only a close control until the manifest is in, so its
  display, orientation and bridge are settled before the page's first script runs.
- From the opened origin only. A redirect elsewhere, a non-2xx status, a body over 16 KiB, anything
  that is not a JSON object with `manifestVersion: 1`, and no answer within 3 seconds each mean no
  manifest: the page opens with the defaults above, and the app's log says why.
- Field by field. An unknown field, an unknown permission and a wrong value are dropped; the rest of
  the manifest stands.
- Once per origin per run of the app, then from memory: a later open uses the copy read before and
  fetches a fresh one behind it, so a deploy that changes a manifest takes effect one open later. A
  relaunch always reads it again: the request bypasses the HTTP cache, so a withdrawn permission does
  not outlive the launch.
- A failure to reach the origin (no network, the timeout) never replaces a manifest already read in
  this run. With none read yet, the page opens with the defaults and the next open tries again. The
  origin's own answers — no file, a redirect elsewhere, a body that is not a manifest — do replace it.
- The redirect check relies on the response naming its URL, which React Native's networking does on
  both platforms.

## Links to a page (2.17.0)

A page shares a link to itself as the context's `appLink` — `https://app.chatic.io/apps/<label>` for
`https://<label>.apps.chatic.io`, `https://app-dev.chatic.io/apps/<label>` for the `apps-dev` domain —
followed by its own path, query and fragment:

```text
https://app.chatic.io/apps/quiz/level/3?seed=7  →  https://quiz.apps.chatic.io/level/3?seed=7
```

- **Where the app is installed**, the OS opens the link in it, and the app opens the page in a sub
  WebView over whatever it shows, as the main web would with `OpenSubWebView`: the page gets no
  `params`, and its manifest applies as on any open.
- **Where it is not**, the link reaches the landing site, which sends the browser on to the page itself.
  The page then runs with no bridge (see [Handshake](#handshake)) and SHOULD still work, or say what the
  app adds.
- **A page MUST build links from `appLink`**, never from a hard-coded host: the shell derives it from
  the opened origin, so a page on the dev domain shares dev links. When the context has no `appLink`
  (an app before 2.17.0) the page shares its own URL instead.
- An app built before 2.17.0 still opens the page: the web reads the link's bare path too, which
  is how such an app hands it over once the association file claims `/apps/*`.
- Only `https` links on the app-link hosts are page links. A link opened in an in-app browser that
  does not hand links to the OS (a messenger's) stays in that browser and opens the page there.

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

| Code                    | Raised by                   | Meaning                                                                                       |
| ----------------------- | --------------------------- | --------------------------------------------------------------------------------------------- |
| `NOT_FOUND`             | the host                    | Not in this host's subset, or not in the page's manifest (2.16.0). Expected from an older app |
| `INTERNAL_ERROR`        | the host                    | A handler failed unexpectedly. Retrying MAY work                                              |
| `TOO_LARGE`             | the host **(2.15.0)**       | The message is over 64 KiB                                                                    |
| `INVALID`               | most requests               | A field is missing, of the wrong type, or over its limit                                      |
| `INVALID_KIND`          | `TriggerHaptic`             | `kind` is not one of the listed values                                                        |
| `NOT_OPEN`              | `FinishSubWebView`          | The view already closed                                                                       |
| `LINK_NOT_ALLOWED`      | `OpenURL`, `OpenShareSheet` | The link is not one this request may open or share                                            |
| `OPEN_URL_FAILED`       | `OpenURL`                   | The OS could not open an allowed link                                                         |
| `CLIPBOARD_WRITE_ERROR` | `CopyToClipboard`           | The OS refused the write                                                                      |
| `SHARE_ERROR`           | `OpenShareSheet`            | The OS share sheet failed                                                                     |
| `UNAVAILABLE`           | `GetSubWebViewUserKey`      | The device has no id to derive a key from                                                     |

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
`title`, the manifest's `name`. A title set here lasts until the next page load in the view.

### `CopyToClipboard`

Needs the `clipboard` permission (2.16.0).

| Request            | Reply              | Errors                             |
| ------------------ | ------------------ | ---------------------------------- |
| `{ text: string }` | `{ copied: true }` | `INVALID`, `CLIPBOARD_WRITE_ERROR` |

### `TriggerHaptic`

| Request                                                                  | Reply | Errors         |
| ------------------------------------------------------------------------ | ----- | -------------- |
| `{ kind: 'selection' \| 'impact' \| 'success' \| 'warning' \| 'error' }` | `{}`  | `INVALID_KIND` |

`selection` is the lightest tick, `impact` a short tap; **(2.16.0)** `success`, `warning` and `error`
are the outcome of something the user did. On iOS they are the system's notification feedback; on
Android 11 and later `success` and `error` are the system's confirm and reject effects, and
`warning`, which Android has no effect for, is the long-press one; before Android 11, `success` is the
key-press effect and `error` the long-press one. An app before 2.16.0 answers the
three with `INVALID_KIND`. The OS honours the user's own touch-feedback setting; a reply does not mean
the device moved.

### `OpenURL`

Needs the `openUrl` permission (2.16.0).

| Request           | Reply | Errors                                |
| ----------------- | ----- | ------------------------------------- |
| `{ url: string }` | `{}`  | `LINK_NOT_ALLOWED`, `OPEN_URL_FAILED` |

Opens only what the view would itself hand to the OS: an `https` or `http` page off the allowlist,
`mailto:`, `tel:`, `sms:`, `itms-apps:`, `market:`. The app's own links and schemes, another sub
WebView page, and anything else answer `LINK_NOT_ALLOWED` — as does a `url` that is not a string.
To show an allowlisted page, navigate to it.

### `OpenShareSheet`

Needs the `share` permission (2.16.0).

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

Needs the `userKey` permission (2.16.0).

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

### `ReportSubWebViewError` (2.16.0)

| Request                               | Reply                   | Errors    |
| ------------------------------------- | ----------------------- | --------- |
| `{ message: string, stack?: string }` | `{ recorded: boolean }` | `INVALID` |

Writes the error to the app's own logs under the page's origin, so a page that breaks on users'
devices can be found and withdrawn. `message` must not be blank. The first 1,000 characters of
`message` and 4,000 of `stack` are kept, not refused: a report is most wanted when the page is least
able to fix it. A page load records 20; after that the reply is `recorded: false` and nothing is
written. A page SHOULD report from `window.onerror` and `unhandledrejection`, which
`chatic-apps-sdk` does. The report reaches the app's logs and nothing else: a page MUST NOT put
the user's data in it.

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

The opener sends `OpenSubWebView { url, title?, params? }`; the shell shows the view full screen,
reads the page's [manifest](#manifest-2160), and then loads the page under a bar with the title and
a close control, or under a floating close control alone for a `fullscreen` page. Each page load — the first, a
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

**(2.16.0) A `fullscreen` page has no bar.** The shell draws a floating close control over the
page's top-right corner instead, always, so a page cannot leave the user without a way out; a page
SHOULD keep that corner clear. The padding stays: a page still cannot draw behind the status bar or
the home indicator, and a full-bleed mode is not part of this protocol.

**(2.16.0) The manifest's `orientation` holds the view** `portrait` or `landscape`, or lets it follow
the device (`any`). It applies to the view only; the app underneath returns to its own when the
view closes.

## Security invariants

These hold in every version; a change that breaks one is not a protocol change but a different
feature, and needs its own decision.

- **The host answers only the opened origin.** A message from another origin, a frame on one, or a
  page the view navigated to gets no reply.
- **Nothing the page receives identifies the device, the install or the DoU user**: not the device id,
  not a value that maps to it one to one (a plain hash of it included), not the account. The device
  id is treated as a credential, not only as an identifier: DoU's own sign-in relies on it. The one
  identifier a page gets, the user key, is an HMAC over the page's origin keyed by the device id:
  one-way, different on every origin, and only for a page whose manifest declares `userKey`.
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
| Drawing behind the system bars                              | `fullscreen` drops the bar; the system bars stay outside the page      |
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
  Android, which runs edge to edge;
- **(2.17.0)** that iOS and Android hand an `/apps/…` link to the app (the association file and the
  intent filter), that a cold-start link opens the page once the web is up, and that the landing
  redirect reaches the page in a browser;
- **(2.16.0)** that a manifest's `orientation` holds a full-screen modal on both platforms (it is
  react-native-screens' screen option, set once the manifest is in), and that the outcome haptics
  feel distinct on a device.
