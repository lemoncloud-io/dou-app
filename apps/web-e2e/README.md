# web-e2e

**`apps/web` running in its native (WebView) mode, in a real browser, against a fake native shell and
a fake relay.** The page believes it is inside the mobile app: `window.ReactNativeWebView` is there
before any of its scripts run, the app's own boot script has set its globals, and every bridge
request it makes is answered by a scripted shell in the test process. Its HTTP requests and its
socket are answered from fixtures. Nothing real is behind either side.

That is the layer no unit test reaches. A Jest test of a hook mocks the bridge; a by-hand check on a
simulator reaches everything but costs a build and a person. The bugs this suite exists for live in
between — a reply the page does not match, a handshake that lands after the screen needed it, a
fallback that never fires because the old-app answer was never exercised.

## Run it

```bash
npx playwright install chromium webkit   # once per machine (CI adds --with-deps)
yarn web:e2e                              # = npx nx run web-e2e:e2e
```

Playwright starts the web app's Vite dev server on port 5390 (`WEB_E2E_PORT` moves it) with every
`VITE_*` variable given (`src/support/env.ts`): each backend endpoint is an `*.e2e.test` address and
the rest are empty or local, so a developer's own `apps/web/.env` does not reach the page. Locally, a
server already on that port is reused as it is, with whatever environment it was started with; in CI
it always starts its own.

One file, one browser, a visible window:

```bash
cd apps/web-e2e
npx playwright test src/specs/attachment-picker.spec.ts --project=webkit-ios --headed
```

A failure leaves a trace and a screenshot in `dist/.playwright/apps/web-e2e/test-results/<test>/`
(`npx playwright show-trace <zip>` replays the run). Beside them, whenever they are not empty, two
lists: `backend-unanswered.txt` (requests no fixture answered) and `shell-not-found.txt` (bridge
messages the shell answered `NOT_FOUND`). Both are also attached to the test's report.

## What is in it

| Path                      | Holds                                                                       |
| ------------------------- | --------------------------------------------------------------------------- |
| `src/support/fake-shell/` | The shell: transport, handler table, in-memory cache, the app's boot script |
| `src/fixtures/`           | The relay: the guest every scenario signs in as, HTTP routes, socket frames |
| `src/support/test.ts`     | `test` with `shell` and `backend` in place before the page loads            |
| `src/specs/`              | The scenarios                                                               |

**Two browser projects, one per platform.** `webkit-ios` emulates an iPhone and the shell delivers
replies on `window`, as react-native-webview does on iOS; `chromium-android` emulates a Pixel and
delivers on `document`, as it does on Android. Each also carries the suffix the app's WebView adds to
the user agent (`DOU_IOS` / `DOU_ANDROID`). Every scenario runs on both.

**Both fakes are installed for every test**, before the page loads anything — a scenario that never
names `shell` or `backend` still runs inside the app, against the fixtures.

### The shell

The shell is the mobile app's own `AppBridgeHost` (`@chatic/bridges`) running in the test process, with
a Playwright transport in place of the WebView: the page's `postMessage` reaches it through
`page.exposeFunction`, and its replies go back as a JSON string dispatched as a `message` event. So the
envelope rules — matching a reply to its `refId`, `NOT_FOUND` for a message without a handler, the
WebAppReady handshake, holding events until the web is ready — are production code. What is fake is
the handlers.

**The handler table is typed against the contract.** A handler returns the payload of the reply
`WEB_MESSAGE_RESPONSE_TYPE` pairs with its request (`ShellReply<K>`), and the reply's `type` is filled
in from that map, never by the handler. Renaming a reply or changing its payload in
`@chatic/app-messages` breaks the fixtures at compile time instead of leaving a scenario that fakes a
contract the app no longer speaks. `ShellFailure` answers `success: false` with a domain code (`BUSY`);
leaving a type out answers `NOT_FOUND`, which is what an app built before that message does.

```ts
shell.handle('PickAttachments', () => ({ items: [report], refused: [] }));
shell.handle('PickAttachments', () => new ShellFailure('BUSY'));
const request = await shell.waitFor('PickAttachments'); // rejects after 15s, naming what was sent
```

A reply the shell could not dispatch into the page — for any reason but the page navigating or
closing, which the real shell also drops — fails the test, as does a failure the injection script
reports (below).

**The defaults are an up-to-date app with nothing pending**: its boot answers, and its local cache.
Inside the app the web keeps its cache in the shell's SQLite, not IndexedDB, so the shell answers
`FetchCacheData` and its siblings from memory (`memoryCache.ts`) with the part of the app's query
semantics the web relies on. Everything else answers `NOT_FOUND` — the photo grid, file transfers,
push tokens — and the web takes the fallback it has for an older app. A scenario that is about one of
those adds its handler.

**The page gets the app's own boot script** (`getSyncInjectionScript` from
`apps/mobile/src/app/webview/utils/injectionScripts.ts`), not a copy: device info, the
`ChaticMessageHandler` relay, the config bag (onboarding is done) and the safe-area variables. It is
loaded at run time from a computed path rather than imported, so `@chatic/mobile` does not become a
dependency of this project — a static import would make typechecking it build the mobile app,
whose typecheck is red and left out of CI. That gives up the compile-time check of its arguments, and
what replaces it is partial: the script reports a failure in itself through the bridge (tag
`INJECTION`) and the test fixture fails the test on that report, which catches an argument whose
absence makes the script throw — not one that is silently `undefined` in the text it produces. A
change to the parameters in `injectionScripts.ts` therefore wants a look at `appInjection.ts`.

Its timing is moved by one step. A Playwright init script runs before the document has a root
element — earlier than react-native-webview's "before content loaded" injection — and the app's script
styles `document.documentElement`. The shell runs it the moment `<html>` exists instead, which is still
before the page's first script.

### The relay

`FakeBackend` routes every request that is not for the dev server. The relay's HTTP API is a table
keyed `'POST /oauth/register-device'`; its socket is a table keyed by frame type (`'chat.feed'`), each
answered with a `:ok` frame. The defaults are a first launch: a fresh guest in the relay's default
place, with one room — the self chat, empty. Every value in `fixtures/guest.ts` is invented; the
identity token is unsigned, because only the server ever verifies one.

A request with no fixture is refused (an aborted request, a `:error` frame) and listed, not failed:
the app adds reads in ordinary feature work, and a scenario should break on what it is about. Read
the list when a scenario fails, and when it is not empty. `NO_REPLY` leaves a socket request
unanswered on purpose — the attachment scenarios hold `upload.start`, so what follows the pick is not
decided by accident.

## The scenarios

| Spec                        | What it pins                                                                                                                                                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `boot-splash.spec.ts`       | The handshake says `holdsBootSplash`; `FirstScreenReady` is posted once, after the cover is gone and home is on screen; a boot that cannot sign in holds the splash until the 10s cap and then lifts it.                                             |
| `attachment-picker.spec.ts` | "Choose from files" asks the shell (`PickAttachments`, `document`, up to 10) and the answer becomes a file message; a file the shell refused is reported and not sent; an app without the picker gets the page's file input, and is not asked again. |

## Limits

What a passing run does **not** say:

- **WebKit is not WKWebView, and Chromium is not Android System WebView.** They are the nearest
  engines a CI machine runs. A WKWebView-only behaviour — its gesture timing for opening a file input,
  its scroll and viewport quirks — is not exercised.
- **No real native code runs.** The OS pickers, PhotoKit and the Android Photo Picker, the keyboard
  and its height, the real safe area, push delivery, the file transfer and video conversion are
  answers someone wrote. The keyboard is always closed and the insets are plausible constants.
- **The shell's handlers are not the app's handlers.** That the app answers a message the way a
  scenario assumes is for the native side's own tests — a contract test over every request in
  `WEB_MESSAGE_RESPONSE_TYPE` is the planned companion to this suite. Native-device smoke flows on a
  simulator and an emulator are deferred (ADR-0180).
- **The relay is fixtures.** A server change the fixtures were not updated for passes here and fails
  in the field.
- **The dev server, not a production build.** Minification and the production-only module aliases in
  `apps/web/vite.config.mts` are not exercised.
- **CI runs the suite only when `web-e2e` is affected** — the web app, the libs it builds from, or this
  project — or when the mobile injection script changes. That file is named in the workflow by path,
  because there is deliberately no dependency edge to `@chatic/mobile` (see "The shell"); anything
  else of the mobile app's that a scenario assumes does not trigger it.

## Adding a scenario

1. Put it under `src/specs/`, import `test` and `expect` from `../support/test`, and start with
   `page.goto('/')` — the page boots as a fresh guest.
2. Change only what the scenario is about: `shell.handle(...)` for a bridge answer,
   `backend.useHttp(...)` / `backend.useSocket(...)` for the relay.
3. Assert what a user sees, by role and text; assert on `shell.received(...)` for what crossed the
   bridge and `backend.sent(...)` for what went out on the socket. A "nothing happened" assertion
   proves nothing on its own — make something observable happen after it first.
4. Break the thing it is about — the app code or the fixture — and watch it fail on both browsers
   before trusting it.
