# The sub WebView

A second WebView the shell shows over the main one, for a page on another origin. The web asks for
it with `OpenSubWebView`; the shell shows the page full screen under a bar with its title and a close
control, and tells the web with `OnSubWebViewClosed` when it is gone. The messages and their codes are
in `@chatic/bridge-messages` (`model/sub-webview.ts`).

It exists so the app can host pages it does not own the code of — a service of its own, a notice —
without
sending the user out to the OS browser and without letting that page near the app. It is not a
general in-app browser: an arbitrary site such as a search portal is never shown here (see
[Where it may go](#where-it-may-go)).

## What the page gets, and what it does not

**Nothing of the main WebView.** The sub WebView is its own component (`subWebView/SubWebView.tsx`),
not `AppWebView` with another URL:

- none of the main WebView's `window.CHATIC_APP_*` globals (device id, install id, Firebase install
  id, run id) and no `ChaticMessageHandler`. react-native-webview's own history shim on iOS still
  runs; it only reports navigation state to the shell;
- the platform's own user agent, without the `DOU_IOS` / `DOU_ANDROID` prefix the main WebView adds,
  so a server cannot mistake it for the app;
- none of the main WebView's handlers: its messages go to a host of its own (below).

**A context, defined before the page's scripts run.** `window.ChaticSubWebView` is a frozen
`SubWebViewContext`: `protocolVersion` (1), `viewId`, `platform`, `appVersion`, `locale` (the
language the user chose in the app), `theme` (the app's resolved theme, which can differ from the
OS's) and `params` — what the web passed in `OpenSubWebView`, never put in the URL. Nothing that
identifies the device, the install or the user. The script defines it only when the page's origin is
the one the view was opened on, so a page the view navigates to — another allowlisted one too —
finds
nothing (`subWebViewContextScript.ts`). A later theme or language change arrives as the push
`OnSubWebViewContextChanged`.

**A bridge of its own, with a subset of the vocabulary.** The page speaks the same message
vocabulary as the main web, through `window.ReactNativeWebView`, to a second `AppBridgeHost`
(`createSubBridgeHost.ts`) that registers only `SubWebViewRequestType`:

| Request              | What the sub WebView's host does                                                     |
| -------------------- | ------------------------------------------------------------------------------------ |
| `WebAppReady`        | The handshake; lists exactly this table. No cache schema or types: nothing to store  |
| `Ping`               | Answered by the host itself                                                          |
| `FinishSubWebView`   | Closes this view as `page`, handing `result` (JSON, at most 16 KiB) to the web       |
| `SetSubWebViewTitle` | Puts a title (1–100 characters) in the bar, over the document's own                  |
| `CopyToClipboard`    | Writes text to the clipboard                                                         |
| `TriggerHaptic`      | Plays one short haptic                                                               |
| `OpenURL`            | Opens only what the view would hand to the OS — never the app's own links or schemes |

Everything else — cache, preferences, push tokens, purchases, files, logs — answers `NOT_FOUND`.
The handlers are written for this host (`subBridgeHandlers.ts`), not borrowed from the main
WebView's: the boundary forbids that, and the main ones assume the main web is asking — its
`OpenURL`
opens the app's schemes. The table is typed by `SubWebViewRequestType`, so a request outside the
subset does not compile there — locally: CI does not type check `apps/mobile`. What CI does run is
`createSubBridgeHost.test.ts`, which checks the handshake lists exactly the subset.

**Only the origin the view was opened on is answered.** Every message is checked against that origin
before the host sees it; a page the view navigated to, or a frame elsewhere, gets no answer at all.
One caveat: on an Android System WebView too old for web message listeners, react-native-webview
reports a frame's message under the top-level URL, so a cross-origin frame inside the opened page
would pass. Current WebViews report the frame's own origin.

**Each page load gets a fresh host.** A host stays ready after its page's first message, so a
reloaded
page would be sent pushes before it listens; a new host holds them until the new page's handshake.
A title the last page asked for is dropped at the same moment.
`SubWebView.test.tsx` pins the context, the origin check and the user agent.

**Device features are left open.** Camera, microphone, file pickers and downloads behave as the
WebView and the OS make them behave; nothing is switched off for this view. What keeps that safe is
not a setting but what may be deployed to the allowlisted domains: only pages that passed the app's
own content review. What each feature does today, given the permissions the app declares:

| Feature     | iOS                                                                   | Android                                                                                            |
| ----------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Camera      | The OS asks, under DoU's name and DoU's camera purpose string         | Granted without a prompt once the app holds `CAMERA`                                               |
| Microphone  | The OS asks, under DoU's name and DoU's microphone purpose string     | Granted without a prompt once the app holds `RECORD_AUDIO`; asked for at run time when it does not |
| Location    | The app declares no location purpose; not usable                      | `geolocationEnabled` is off by default and no permission is declared                               |
| File picker | The OS picker                                                         | The OS picker                                                                                      |
| Downloads   | Not handled: the view sets no `onFileDownload` (unverified on device) | react-native-webview's default saves to the device's Downloads                                     |

Every prompt says "DoU", not the page: to the user, a page's use of a feature is the app's. The
microphone was added for voice messages, and a page gets it on the same terms as the camera: nothing
here refuses an audio capture, and react-native-webview offers no way to refuse audio alone — its iOS
grant setting answers the camera and the microphone with one value, and its Android client turns an
audio request into the app's `RECORD_AUDIO`. Whether a page uses the microphone is part of what its
review checks before it goes on an allowlisted domain. Adding location still needs a purpose string or
permission in the app, so an app release, and is done when a reviewed page needs it.

### For a page's author

- Read `window.ChaticSubWebView` once the page has loaded or after its handshake, not while its
  first script is evaluated: on Android the definition can trail that script. When it is still
  missing, the page is not in the sub WebView (a browser tab, an older app, or a page the view
  navigated to) and has no `params` and no bridge.
- Talk to the app with `@chatic/bridges`' `webClient`, and send `WebAppReady` before anything else:
  the host holds its pushes until then, and the reply lists what this app answers.
- Do not turn on the bridge logger forwarding (`setupBridgeLogger`): `SendLog` is not in the subset
  and every line would come back `NOT_FOUND`.
- `params` and `result` are JSON of at most 16 KiB each; a title is at most 100 characters.
- A login that runs in a popup and answers through `window.opener` does not work here.

## Where it may go

**The allowlist** is `SUB_WEBVIEW_DOMAINS` in `services/subWebView/subWebViewAllowlist.ts`: the
subdomains of `apps.chatic.io` and `apps-dev.chatic.io`, one label deep
(`https://foo.apps.chatic.io`).
The app's review pipeline is the only thing that deploys there, so the pattern means "a reviewed
page",
and a new page needs a deploy rather than an app release. The domain itself
(`https://apps.chatic.io`) is not a page and is refused.

It is a subtree on purpose, not `*.chatic.io`. That would take in the web app itself
(`dou.chatic.io` boots a second copy of the app in the view, and the storage the two WebViews share
is
kept apart by origin alone), the deep-link domain the main WebView's bridge trusts
(`app.chatic.io`),
every internal tool, and every subdomain created later — including one whose DNS record outlived its
service and that someone else now serves.

**A URL that parsers could read two ways is refused**: userinfo, a port, a backslash (Android reads
it
as `/`, so `https://evil.example\@foo.apps.chatic.io` would load `evil.example`), whitespace and
control characters. `SubWebViewService.test.ts` holds these cases.

**Inside the page**, every navigation is decided by `decideSubWebViewNavigation`. The view's
`originWhitelist` is `['*']` so that every one of them reaches it: react-native-webview checks that
list first and hands whatever fails it straight to the OS, the app's own schemes included.

| Navigation                                                                           | Top level      | Inside a frame |
| ------------------------------------------------------------------------------------ | -------------- | -------------- |
| An allowlisted page, `about:blank`                                                   | Loads          | Loads          |
| Any other `https`                                                                    | The OS browser | Loads          |
| `http`                                                                               | The OS browser | Dropped        |
| `mailto:`, `tel:`, `sms:`, `itms-apps:`, `market:`                                   | The OS         | Dropped        |
| The app's links: `chatic://`, `chatic-dev://`, `app(-dev).chatic.io/i`, `/s`, `/s/*` | Dropped        | Dropped        |
| `intent:`, `javascript:`, `file:`                                                    | Dropped        | Dropped        |
| `data:`, `blob:`                                                                     | Dropped        | Loads          |

A request with no `isTopFrame` — Android reports none — is decided as a top-level one. The app's own
links are dropped because the web that opened the view owns the app's routing; a page under it must
not drive it. Loaded in the view, the universal-link paths would show the invite bounce page, and
handed to the OS they would re-enter the app on Android. `target=_blank` and `window.open` load in
the same view — `setSupportMultipleWindows={false}` on Android, and on iOS react-native-webview
loads a
request with no target frame in the view it came from — so they go through the same check. A login
that runs in a popup and answers through `window.opener` therefore does not work in a sub page.

## Lifecycle

One view at a time; a second `OpenSubWebView` is refused with `ALREADY_OPEN`.

```mermaid
sequenceDiagram
    participant Web as Web (main WebView)
    participant Handler as subWebViewHandlers
    participant Service as SubWebViewService
    participant Routing as routeSubWebViewEvents
    participant Screen as SubWebViewScreen

    Web->>Handler: OpenSubWebView { url, title? }
    Handler->>Service: open()
    Service-->>Routing: opened
    Routing->>Screen: navigate('SubWebView')
    Handler-->>Web: OnOpenSubWebView { viewId }
    Note over Screen: the user taps close, or Android back with no history
    Screen->>Service: close(viewId, 'user')
    Service-->>Routing: closed → goBack()
    Service-->>Handler: closed (notifyHost)
    Handler-->>Web: OnSubWebViewClosed { viewId, reason: 'user' }
```

| Reason   | Who closed it                                                               |
| -------- | --------------------------------------------------------------------------- |
| `user`   | The bar's close control, or Android back with no page to go back to         |
| `host`   | The web, with `CloseSubWebView`                                             |
| `system` | The shell, before a deep link or a tapped push navigates the web            |
| `page`   | The page, with `FinishSubWebView` — the only reason that carries a `result` |

**A deep link or a tapped push closes the view first.** `useDeepLinkNavigation` closes a showing
view
as `system` before it sends `OnNavigate` (or resets the navigator for a native route), so the web
hears why the view went before it hears where to go, and what it opens is not hidden underneath.

**The web reloading under the view closes it without a word.** `MainScreen` calls
`resetForNewHost()` on every `WebAppReady`: a handshake after the first is a page that reloaded, and
the page that opened the view is gone. The view is dismissed and no `OnSubWebViewClosed` is sent.

**The screen cannot be swiped away.** It is a `fullScreenModal` with gestures off, so every close
goes through the bar's control or Android back, and the web always hears of it. If the screen leaves
some other way anyway, its unmount closes the view as `user`; once the service has closed it, that
call answers `NOT_OPEN` and does nothing. The other way round, a close control pressed on a screen
the
service no longer knows leaves by itself, since nothing else would take it down.

**Android back** goes to the page's own history first, then closes the view. The main WebView's back
listener (`useAndroidBack`) passes the press on while a view shows: listeners run newest first, and
that one is re-added whenever the web's `canGoBack` changes, so it can end up above the sub
WebView's.

## The boundary

The main WebView (`webview/`) and the sub WebView (`subWebView/`, `features/subWebView/`) never
import
each other. They meet only in `services/subWebView`, which holds the allowlist and the view that is
showing and tells two listeners about each change: `routeSubWebViewEvents`, which shows and
dismisses
the screen, and the main WebView's handler, which tells the web. `apps/mobile/eslint.config.mjs`
enforces it with `no-restricted-imports`, both ways; the one path let through is
`webview/hooks/appEventContract`, test support with no runtime that every event's colocated test
uses. `useAndroidBack` and `useDeepLinkNavigation`
reach the view only through that service too.

The reason is what a shortcut would carry across: an import from `webview/` into the sub side is how
the main WebView's injection or handlers would end up in front of a page that must not have them,
and
an import the other way ties the main WebView to a screen it should only know through the service.

## Files

| File                                                   | Role                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `src/app/services/subWebView/SubWebViewService.ts`     | Validates, records the view, reports opened/closed                      |
| `src/app/services/subWebView/subWebViewAllowlist.ts`   | `SUB_WEBVIEW_DOMAINS`, `isAllowedSubWebViewUrl`                         |
| `src/app/webview/hooks/subWebViewHandlers.ts`          | `OpenSubWebView` / `CloseSubWebView`, and the `OnSubWebViewClosed` push |
| `src/app/subWebView/SubWebView.tsx`                    | The second WebView: its context, its host, the origin check             |
| `src/app/subWebView/createSubBridgeHost.ts`            | The sub WebView's own `AppBridgeHost`, with the subset only             |
| `src/app/subWebView/subBridgeHandlers.ts`              | The page-facing handlers, typed by `SubWebViewRequestType`              |
| `src/app/subWebView/subWebViewContextScript.ts`        | `window.ChaticSubWebView`, for the opened origin only                   |
| `src/app/services/subWebView/subWebViewData.ts`        | The 16 KiB data limit and the 100-character title limit                 |
| `src/app/subWebView/subWebViewNavigation.ts`           | Load, hand to the OS, or drop                                           |
| `src/app/features/subWebView/SubWebViewScreen.tsx`     | The bar and its close control                                           |
| `src/app/features/subWebView/routeSubWebViewEvents.ts` | Navigates to the screen and back as the service reports                 |

## Checking it by hand

The debug panel's Bridge screen has an `OpenSubWebView` preset. Pick it, give it a payload such as
`{ "url": "https://<page>.apps-dev.chatic.io/" }`, and send it as a request: the page slides up over
the
app, the reply carries the `viewId`, and closing it sends `OnSubWebViewClosed`. A URL off the
allowlist
answers `NOT_ALLOWED`. It needs a page actually deployed under `apps-dev.chatic.io`.
