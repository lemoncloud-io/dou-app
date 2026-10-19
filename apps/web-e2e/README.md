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
yarn web:e2e:install   # once per machine: Chromium and WebKit (CI adds --with-deps)
yarn web:e2e           # the suite, as CI runs it (= npx nx run web-e2e:e2e)
yarn web:e2e:ui        # Playwright's UI mode: pick, run and step through scenarios
yarn web:e2e:headed    # the suite in visible browser windows
```

Playwright starts the web app's Vite dev server on port 5390 (`WEB_E2E_PORT` moves it) with every
`VITE_*` variable given (`src/support/env.ts`): each backend endpoint is an `*.e2e.test` address and
the rest are empty or local, so a developer's own `apps/web/.env` does not reach the page. Locally, a
server already on that port is reused as it is, with whatever environment it was started with; in CI
it always starts its own.

The last two call Playwright directly rather than through Nx, so its own arguments pass through —
one file, one browser:

```bash
yarn web:e2e:headed attachment-picker --project=webkit-ios
```

A failure leaves a trace and a screenshot in `dist/.playwright/apps/web-e2e/test-results/<test>/`
(`npx playwright show-trace <zip>` replays the run). Beside them, whenever they are not empty, two
lists: `backend-unanswered.txt` (requests no fixture answered) and `shell-not-found.txt` (bridge
messages the shell answered `NOT_FOUND`). Both are also attached to the test's report.

## What is in it

| Path                      | Holds                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/support/fake-shell/` | The shell's Playwright transport and its injection; the core — handler table, in-memory cache, boot answers — is `@chatic/fake-shell`      |
| `src/fixtures/`           | The relay: the guest every scenario signs in as, HTTP routes, socket frames, rooms, invites, clouds, subscriptions (and the shell's store) |
| `src/support/test.ts`     | `test` with `shell` and `backend` in place before the page loads                                                                           |
| `src/support/app.ts`      | Steps scenarios share: the back button, background and foreground, the history index                                                       |
| `src/specs/`              | The scenarios                                                                                                                              |

**Two browser projects, one per platform.** `webkit-ios` emulates an iPhone and the shell delivers
replies on `window`, as react-native-webview does on iOS; `chromium-android` emulates a Pixel and
delivers on `document`, as it does on Android. Each also carries the suffix the app's WebView adds to
the user agent (`DOU_IOS` / `DOU_ANDROID`). Every scenario runs on both.

**Both fakes are installed for every test**, before the page loads anything — a scenario that never
names `shell` or `backend` still runs inside the app, against the fixtures.

### The shell

The shell is the mobile app's own `AppBridgeHost` (`@chatic/bridges`) running in the test process, with
a Playwright transport in place of the WebView: the page's `postMessage` reaches it through
`page.exposeFunction`, and its replies go back as a JSON string dispatched as a `message` event.
Everything but that transport lives in [`libs/fake-shell`](../../libs/fake-shell/README.md), whose
handler tables the virtual shell answers with too ([`apps/shell-adapter`](../shell-adapter/README.md)),
so a message contract has one set of fake answers to follow. Because the host is the app's own, the envelope rules — matching a reply to its
`refId`, `NOT_FOUND` for a message without a handler, the WebAppReady handshake, holding events until
the web is ready — are production code. What is fake is the handlers.

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

`shell.push(type, data)` sends an app → web event (a tap, a resume, the back button); before the
handshake it is held, as the app holds it. `shell.delivered(type)` resolves once such an event has
actually been dispatched in the page, which can be well after it was pushed: the shell's delivery is
a round trip through the test process, and on a loaded machine that can fall behind a page booting,
where on a device a held event lands within milliseconds of the handshake. A scenario that depends on
that ordering holds something else back until then (`backend.gateHttp`, below).

A reply the shell could not dispatch into the page — for any reason but the page navigating or
closing, which the real shell also drops — fails the test, as does a failure the injection script
reports (below).

**The defaults are an up-to-date app with nothing pending**: its boot answers, and its local cache.
Inside the app the web keeps its cache in the shell's SQLite, not IndexedDB, so the shell answers
`FetchCacheData` and its siblings from memory (`MemoryCache` in `@chatic/fake-shell`) with the part
of the app's query semantics the web relies on. Everything else answers `NOT_FOUND` — the photo grid, file transfers,
push tokens — and the web takes the fallback it has for an older app. A scenario that is about one of
those adds its handler.

**The page gets the app's own boot script** (`getSyncInjectionScript` from
`apps/mobile/src/app/webview/utils/injectionScripts.ts`), not a copy: device info, the
`ChaticMessageHandler` relay, the config bag and the safe-area variables. The bag has onboarding
done and the debug overlay off: the suite's `LOCAL` stage would otherwise float that overlay's
button over the composer's Send. The script is loaded at run time from a computed path rather than
imported, so `@chatic/mobile` does not become a dependency of this project — a static import would
make typechecking it build the mobile app, whose typecheck is red and left out of CI. That gives up
the compile-time check of its arguments, and what replaces it is partial: the script reports a
failure in itself through the bridge (tag `INJECTION`) and the test fixture fails the test on that
report, which catches an argument whose absence makes the script throw — not one that is silently
`undefined` in the text it produces. A change to the parameters in `injectionScripts.ts` therefore
wants a look at `AppInjectionParams` in `@chatic/fake-shell`.

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
decided by accident. A handler that returns a promise answers when it settles (a rejection answers
`:error`): the relay slow on one request while the page goes on, which is how the paging scenario
holds an older page and then lets it land. A handler that throws answers an `:error` frame carrying
its message, which is how the relay refuses: `throw new SocketRefusal('403 FORBIDDEN - not a member of channel')`.
`dropSockets()` closes the relay socket from the server's side, and `connections` counts how often
the page has opened it; every frame records which opening it went out on (`connection`), so a
scenario can tell a read on the new socket from one on the old. `handlerOf(type)` returns a socket
handler as it stands, so a scenario can wrap one (hold the sign-in on a reconnect) rather than
restate it. `gateHttp(route, gate)` holds one route's answer until `gate` settles — the cold-start tap holds the guest login until the tap has
reached the page.

Fixtures beyond a first launch are opt-in, so a scenario says which world it starts in:
`backend.useSocket(roomsSocket(backend, [dmRoom()]))` adds a relay 1:1 with history, and
`leftDmRoom()` one the guest has left, which the relay still serves, and `longDmRoom(200)` one with a
long history (`fixtures/rooms.ts`). `chat.feed` there pages as the relay does — newest first, below an
exclusive `cursorNo`, `limit` rows (20 when the request names none), and `cursorNo: 0` on the last page
(`feedPage`). `installCloud(backend, …)` installs a cloud with its own backend and socket, with a
second place and its room when asked (`secondPlace`); setting `refuseSwitchInto` on the state it
returns makes `auth.switch` refuse to move into that place. `ownCloud(backend)` lists that cloud in
the relay's catalog as the guest's own and answers the owner's way in — `delegate-cloud`, then the
cloud's `exchange-token` — or refuses it (`issue: false`) (`fixtures/cloud.ts`). `fixtures/invites.ts`
holds the relay invite and the link that carries it. `fixtures/subscription.ts` holds the purchase:
`signedInMember` (a purchase is refused to a guest), `installSubscriptions` (the relay's plans, a
membership that turns active once a purchase is checked, and the check), and `storeHandlers` for the
shell's store, whose `Purchase` answers nothing the page reads — the scenario pushes the outcome
(`OnPurchaseSuccess`, `OnPurchaseError`) as the app does. Another host is keyed by its full address (`'GET https://c1.e2e.test/api/hello/invite-code'`) and another socket by its
endpoint (`useSocketAt`; `sentAt` reads one socket's frames, `allFrames` all of them in order). Every socket the page opens is answered here
whatever its host, except the dev server's own; one with no fixture is closed and listed. The fake
cloud keeps the server rule its scenarios are about: a session sits on one place at a time — the one
its token names when it signs in, or the one it last switched to — and a place profile is read and
written there.

## The scenarios

| Spec                            | What it pins                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `boot-splash.spec.ts`           | The handshake says `holdsBootSplash`; `FirstScreenReady` is posted only once the home route's frame is drawn, read in the page as it is posted; a boot that cannot sign in holds the splash until the 10s cap and then lifts it.                                                                                                                                        |
| `attachment-picker.spec.ts`     | "Choose from files" asks the shell (`PickAttachments`, `document`, up to 10); the answer waits in the "Files to send" tray, and Send makes it a file message in the room; a file the shell refused is reported and never sent; an app without the picker gets the page's file input, and is not asked again.                                                            |
| `back-navigation.spec.ts`       | On Android, `SetCanGoBack` is true exactly while an overlay is open, a back press closes the overlay before it rewinds a screen, and at the app's first entry a press is not spent; on both, an invite link that launched the app sits one entry above home, and back returns there.                                                                                    |
| `push-navigation.spec.ts`       | A tap that launched the app opens its room with the splash lifted over the room, not home, and home underneath; a tap while the app is open replaces the room on screen and a repeat tap adds nothing; a tap into a 1:1 the guest has left says so and lands on home, leaving one home entry rather than two.                                                           |
| `cloud-invite-entry.spec.ts`    | An invite back into the cloud and place already open switches the session into the place before the profile check, and asks for no profile (the same-cloud regression); an invite into a place with no profile asks for one and saves it on that place.                                                                                                                 |
| `oauth-login.spec.ts`           | Each of the shell's three answers to `OAuthLogin` ends the wait: a credential promotes the guest and returns to MY, a cancel and a failure each say so and leave the buttons usable.                                                                                                                                                                                    |
| `app-resume.spec.ts`            | Back in the foreground the page asks for the resume cover to come down and the open room shows what arrived while away, on the same screen; a socket the relay dropped meanwhile is opened and signed in again, and the room catches up. The wake kick for a half-open socket is not reached.                                                                           |
| `relay-invite-entry.spec.ts`    | A relay invite link opened as the app comes back to the foreground, whose `invite.get` is lost to the socket closing under it, is read again on the next socket once it has signed in, and the invite shows with no failure dialog.                                                                                                                                     |
| `chat-paging.spec.ts`           | A room opens on its newest messages; each scroll to the top asks for 50 more below the oldest one shown (`chat.feed`, `cursorNo`), until the room's first, with every message once and the row being read kept in place. An older page refused is asked for again after 2s, then 4s, with the room intact; one held is asked for once however often the reader scrolls. |
| `cloud-switch.spec.ts`          | Into an owned cloud and between its two places, home shows only the selected place's room and none of the relay's, the shell's cache keeps each side in its own partition, and DoU Home brings the relay back; a refused cloud entry and a refused place switch are rolled back, and a cloud read landing after the refused entry leaves the relay rooms.               |
| `room-mute.spec.ts`             | A room muted from the home list while the socket is signing in again shows muted at once, sends nothing until the socket is back, and then sends `join.update` on the new socket; the row stays muted throughout.                                                                                                                                                       |
| `room-read.spec.ts`             | A room the guest opens loses its unread count on the list at once: when the relay fails the `chat.read`, the count stays gone and the read is sent again until the relay has it; when the room is entered while the socket is signing in again, the count goes before the relay could have heard, and the read follows on the new socket.                               |
| `subscription-purchase.spec.ts` | A completed store purchase is checked with the relay, finished only after that, confirmed with "You are subscribed." and the membership reads active; a cancel says nothing and can be retried; a store error and a pending purchase (the page's own 60s wait) say "Payment failed", and nothing is checked or finished.                                                |

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
- **The paths the app hands over are copies.** An invite link's expanded path and a push tap's path
  are written into the fixtures as the mobile converters produce them (`convertShortUrlWithEnvsSync`,
  `resolvePushTapPath`), not produced by them, so a change there is not seen here.
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
