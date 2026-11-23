# Sub WebView

Source: `sub-webview.ts`, and `SubWebViewRequestType` in `web-message.ts`. See the [index](./README.md) for
conventions.

A second WebView the shell shows over the app's own, for a page on another origin. The web asks for it with a
URL; the shell shows it with its own close control and reports when it is gone. One sub WebView at a time. The
reply to `OpenSubWebView` arrives once the shell has started to show it, not when it closes; the close arrives as
`OnSubWebViewClosed`. Since 2.10.0.

## What a shell opens, and how far it trusts it

Three tiers, decided for both shells by the shared `subWebViewTrustOf`:

- `firstParty` — the hub, `https://apps.chatic.io` / `https://apps-dev.chatic.io`, by exact origin.
- `reviewed` — one label under those domains, which the app's review pipeline alone deploys to.
- `external` — any other plain https site, which a cloud owner chose. It gets the base set only: no manifest is
  fetched from it, and the bar always shows its host.

The web app's own origin is never a trusted page, since that would boot a second copy of the app beside the first.
A shell reports how far it opens in the handshake as `subWebViewOpenScope` (`reviewed`: the hub and reviewed
pages only; `anyHttps`: any plain https site as well, in the `external` tier; absent = `reviewed`, which is what
a phone shell that predates the tiers does). A link inside the page that leaves the origin it was opened on goes
to the OS browser, and one into the app's own routing is dropped. The web learns whether a shell has these
messages from the handshake's `supportedWebMessages` before it asks.

The page talks to the shell through a bridge of its own: a second host that registers only
`SubWebViewRequestType` (a subset of this vocabulary, checked at compile time) and answers only the origin the
view opened on. It never reaches the web that opened it, except through `params` going in and `result` coming
out. Limits (checked in the shells): `params` and `result` at most 16 KiB serialized, a title 1-100 characters, a
message to the host at most 65,536 characters serialized.

Failures from the web-side messages: `INVALID` (a missing or malformed field, a URL that is not `https`, data
over its limit), `NOT_ALLOWED` (the shell does not open the URL: outside what it opens, or a URL that could be read
two ways: userinfo, a port, a backslash, whitespace, an IP literal), `ALREADY_OPEN`, `NOT_OPEN` (the view named,
or the page's own view, has already closed).

## Web → native

- **`OpenSubWebView`** — show `url` (https). `title` is what the bar shows until the page has a title of its
  own; `params` (a JSON object) reaches the page as `window.ChaticSubWebView.params`, not in the URL; `appId`
  (since 2.19.0) names the app the web resolved `url` from, one DNS label such as `quiz`, so the page's
  `appLink` names the app rather than its host (apps before 2.19.0 ignore it and use the page's label). Reply:
  `viewId`, which names the view in `CloseSubWebView` and `OnSubWebViewClosed`.
    - `MiniAppLaunchParams` is what DoU's own web passes a mini app as `params` (since 2.22.0): who is looking, in
      which cloud and place. Ids and display names only, nothing that authenticates. `user.id` is the user's id in
      that cloud, so a page sees a different id per cloud. `user.isOwner` and `miniApps` go to the hub
      (`firstParty`) alone: the first so it can offer the owner link settings, the second so it can list the
      cloud's mini apps (name and host, never the address). A hub that wants one opened finishes with
      `{ action: 'openMiniApp', id }` and the web opens it.
- **`CloseSubWebView`** — close the view the web opened by `viewId`. Its `OnSubWebViewClosed` (`reason: 'host'`)
  is sent before the reply.

## Native → web

- **`OnSubWebViewClosed`** — sent once per view for every reason: `user` (close control, or Android back with no
  page to go back to), `host` (the web sent `CloseSubWebView`), `system` (the shell closed it to take the user
  elsewhere: a deep link or a tapped push; also since 2.33.0 when the page's process died), `page` (the page
  called `FinishSubWebView`, optionally with a `result`, present only for `page`). Not sent when the web itself
  reloaded while the view showed: the page that opened it is gone, so the shell closes the view without telling
  the page that replaced it.

## From the page to its own host

What a page may use beyond the base set is declared in its manifest and opened by capability, not by message
name. A request whose capability the page did not declare is not registered, so the handshake does not list it
and the host answers `NOT_FOUND`.

- **`FinishSubWebView`** (since 2.11.0) — close this view and hand `result` (JSON, at most 16 KiB) to the web
  that opened it. The page will not run much longer after the reply.
- **`SetSubWebViewTitle`** (since 2.11.0) — show `title` in the shell's bar over the document's own.
- **`OnSubWebViewContextChanged`** (push, since 2.11.0) — the app's `theme`, `locale` or (since 2.30.0)
  `safeArea` changed while the view showed; `safeArea` is pushed once the insets settle.
- **`GetSubWebViewUserKey`** (since 2.14.0; manifest permission `userKey`) — this device's key for this page's
  origin, so the page's own server can keep the user's data (a save game, progress) without an account. Derived
  from the device id and the origin, so the same device gets the same key on the same origin each time, each
  origin gets a different one that cannot be linked to another's or traced back to the device id. It is not the
  DoU account and not proof of anything; a page's server receives whatever the page sends it. 64 lower-case hex
  characters; fails with `UNAVAILABLE` when the shell has no device id.
- **`SetSubWebViewCloseGuard`** (since 2.15.0) — ask the page before the user closes. While `enabled`, the close
  control and an Android back press that would close the view push **`OnSubWebViewCloseRequested`** (with
  `trigger: 'control' | 'back'`) instead; the page then closes with `FinishSubWebView` or stays. A second user
  close within a few seconds closes anyway, so a page cannot keep the user in. Only the user's close is guarded:
  the web's `CloseSubWebView` and the shell's own close are not. Lasts until the next page load in the view.
- **`SetCanGoBack`** and the `OnBackPressed` push (since 2.15.0) — a page claims Android back for itself alone.
- **`ReportSubWebViewError`** (since 2.16.0) — record a page error in the app's logs under the page's origin so a
  page that breaks on users' devices can be found and withdrawn. Text only (`message`, `stack`), cut to its
  limit rather than refused (the desktop shell keeps 1,000 characters of message and 4,000 of stack), and
  capped at 20 reports per page load, after which the reply's `recorded` is `false`.
- **Storage** (since 2.18.0; always in the base set, since it reaches only the page's own data):
  `GetSubWebViewStorage`, `SetSubWebViewStorage`, `RemoveSubWebViewStorage`, `ClearSubWebViewStorage`,
  `GetSubWebViewStorageInfo`. Kept by the app per origin; no other page can read or clear it, and the origin is
  the app's own record of where the view opened, never anything in a request. It belongs to the device like the
  user key: it stays across sign-outs and restarts and goes with the app. Values are JSON; usage is counted as
  the characters of keys plus values serialized, up to 1,048,576 per origin; a write past that fails with
  `QUOTA_EXCEEDED` and changes nothing. A key is 1-200 characters. `Set` stores all entries or none; a `Get`
  leaves out keys with nothing stored; `Remove` of a missing key is not an error. `Set` and `Remove` replies are
  `{ used, limit }`; `GetSubWebViewStorageInfo` adds the `keys`.
- **Device permission** (since 2.20.0; base set): `GetSubWebViewPermission` (where DoU stands with the OS for
  `camera` or `microphone`, showing nothing) and `RequestSubWebViewPermission` (ask the OS, showing its prompt if
  unanswered, replying once the user decided). `state` is `granted` (the OS allows it; `getUserMedia` asks
  nothing more), `prompt` (not asked yet, or refused and may be asked again) or `blocked` (the OS will not ask
  again; only settings help, via `OpenSettings`). The page captures with the WebView's own `getUserMedia` and
  the OS asks under DoU's name; these let it learn the state and ask when the user reaches for the feature
  rather than meeting the prompt mid-capture. The app does not limit a page's device use. Both fail with
  `INVALID` for an unknown kind and `UNAVAILABLE` when the device has no such hardware.
- **Others a page may send**: `OpenURL` (opens only what the sub WebView would hand to the OS), `OpenShareSheet`
  (since 2.12.0; text and a web link only), `CopyToClipboard`, `OpenSettings` (DoU's own page in the OS settings,
  for a blocked permission). Nothing in the page's set reaches the app's own storage, purchases or files.

## Manifest

Served from the page's own origin at `/.well-known/chatic-app.json` and read by the shell before it shows the
page (`manifestVersion: 1`). With none, or one the shell cannot read, the page gets the base set only and the
default display. Unknown fields are ignored, and so is a known field with a wrong value (a shell drops
permission names it does not know). The manifest is read for `reviewed` and `firstParty` pages only, never for
`external` ones, and each shell caps how much of it it reads.

- `name` — what the bar shows when nothing else names the page; 1-100 characters.
- `display` — how the shell shows the page: `titled` (the shell's bar above the page with title and close
  control), `clean` (the page alone under a floating close control inside the safe area; the phone's default),
  `immersive` (since 2.29.0; `clean` drawn under the status bar and home indicator too, the shell pads no
  edge and the page keeps its own controls clear with `env(safe-area-inset-*)` or the
  `--chatic-safe-area-inset-*` properties the shell sets). The desktop default is `titled`. The older names
  `standard` (= `titled`) and `fullscreen` (= `clean`) are still read (`subWebViewDisplayOf` in
  `@chatic/shared`); a shell from before 2.29.0 shows any of the new names with its own default.
- `orientation` — `any` (follows the device), `portrait`, `landscape`.
- `permissions` — capability names: `clipboard` → `CopyToClipboard`, `share` → `OpenShareSheet`, `openUrl` →
  `OpenURL`, `userKey` → `GetSubWebViewUserKey`; plus the runtime permissions below.

## Runtime access (since 2.26.0)

A page's host answers the main web's four runtime requests (`RuntimeHello`, `RuntimeCall`, `RuntimeSubscribe`,
`RuntimeUnsubscribe`) and pushes `OnRuntimeEvent` / `OnRuntimeSessionChanged`, through a whitelist of the
runtime's methods that the manifest opens, answered exactly as the main web is. The table is the runtime's
(`SUB_WEB_VIEW_REPOSITORY_WHITELIST` in `@chatic/runtime-core`). Any one runtime permission registers the four
requests, on the phone only, on a launch whose session the app's runtime holds, for a `reviewed` page opened
while a cloud (Home included) was selected, on a WebView that reports a frame's message under the frame's own
origin (always iOS; Android needs web message listeners). Nothing they open writes, moves a cursor, switches the
cloud or place, or reads another cloud, except the two writes named below.

- `session` — the session snapshot in the hello's answer (`null` without it) and its change pushes.
- `cloud` — the current cloud's own row. `place` — its places. `channel` — channels and their joins in any place of
  the current cloud. `chat` — messages. `user` — users, place profiles and place member lists.
- `chatSend` (since 2.27.0) — the one text write: a plain text message in the user's name to a room of the place the
  view opened on. No attachments, mentions, replies, system or webhook rows. Asked for apart from the reads.
- `chatReact` (since 2.32.0) — one emoji reaction added or removed on a message of a room in that place, in the
  user's name. It opens no read, and neither `chat` nor `chatSend` opens it.

The hello's reply on a sub host (`OnSubWebViewRuntimeHelloPayload`) is always `native` and never settles
ownership (the main web did); it adds `allowed.calls` and `allowed.streams`, the `<repository>.<method>` names the
page may call and subscribe to.

Runtime failures before the runtime is asked: `RUNTIME_NOT_ALLOWED` (the target, method or way of asking is not
allowed, or an argument it is held to was not met: a cloud or place that is not the current one, a message that is
not plain text, a room outside the view's place; `details` is a `SubWebViewRuntimeRefusal` whose `reason` is the
whitelist's reason, `notGranted` for a method the manifest does not hold, `guard` for an unmet argument,
`unknown` for an unlisted name, `otherPlace` for a read that would reach past the view's place), `CLOUD_CHANGED`
(the session's cloud is no longer the one the view opened on; final for the view and every open stream ends with
it), `CONSENT_REFUSED` (the user declined to let this page read in this cloud; asked again next open),
`RATE_LIMITED` (over the view's budget for a server read or a send; `details.retryAfterMs`; since 2.33.0 device
cache reads are limited to 600 a minute per view). Since 2.33.0, while the app is in the background each runtime
stream keeps only its latest event and delivers it on return. The runtime's own codes (`RUNTIME_NOT_AVAILABLE`,
`RUNTIME_ERROR`, ...) pass through as the main web gets them.

## Page-visible context

`window.ChaticSubWebView` is defined by the shell before the page's own scripts run, on the origin the view
opened on only. It holds nothing that identifies the device, the install or the user, and is a snapshot: later
theme, language or safe-area changes arrive as `OnSubWebViewContextChanged`.

- `protocolVersion` — this page-facing contract's own version (currently 1). `appVersion` is the app's version.
- `locale` — the app's language as the user chose it (`ko`, `en`). `theme` is the app's resolved theme, which may
  differ from the OS's.
- `params` — what the web passed to `OpenSubWebView`; `{}` when nothing.
- `appLink` (since 2.17.0) — `https://app.chatic.io/apps/<appId>` for the `appId` the view opened with. A page
  shares `appLink` plus a query of its own; a tap opens the page in the app with that query, or offers the app
  where it is not installed. Opened without an `appId` (a web before 2.19.0), the page's label stands in for it.
- `display` and `safeArea` (since 2.30.0) — the display the shell actually shows the page in (not necessarily
  the manifest's request) and how far the system bars reach into the page in CSS pixels: the values the shell
  sets as `--chatic-safe-area-inset-*` on an `immersive` page, and 0 on every edge of a padded one. Both are
  absent from apps before 2.30.0 and from the desktop shell; a page then reads the properties, then
  `env(safe-area-inset-*)`.
- `platform` — `ios`, `android` or `desktop` (`desktop` since 2.22.0). `viewId` names the view.
