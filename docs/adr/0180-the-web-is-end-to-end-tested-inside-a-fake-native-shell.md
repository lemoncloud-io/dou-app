# ADR-0180: The web is end-to-end tested inside a fake native shell

> Status: Accepted · Decided: 2026-10-08 · Implemented: `feat/web-e2e-fake-native-shell`
> · Scope: `apps/web-e2e` (new), `.github/workflows/verify.yml` (`e2e` job)
> · The module doc is [apps/web-e2e/README.md](../../apps/web-e2e/README.md)

## Context

The web app's and the mobile app's automated tests are Jest unit tests in jsdom: about 380 spec files
in `apps/web`, 75 in `apps/mobile`, 105 in `libs/app-runtime`, all beside their source. None of them runs the web app the
way the mobile app runs it. Inside the app the web is in its native mode: `window.ReactNativeWebView`
is present, its cache lives in the shell's SQLite behind bridge messages, its pickers are the shell's,
and its boot waits on a handshake. A unit test of any one piece mocks the bridge on the other side.

The faults in this area so far sat between the pieces: a reply the page did not match, a handshake
that arrived after the screen needed it, a fallback for an older app that never fired. They were found
by hand on a simulator or a phone, after a build, by someone who knew to look. Nothing ran them on a
pull request.

## Decision

**Testing across the WebView boundary is planned in three tiers, and this ADR builds the middle one.**

1. **Contract tests on the native side** (planned, a separate change): Jest tests beside the mobile
   message router and the desktop main process, checking that every request in
   `WEB_MESSAGE_RESPONSE_TYPE` has a handler and answers with its paired reply.
2. **Browser E2E of the web inside a fake shell** (this ADR): Playwright, on every pull request that
   touches the web.
3. **Native-device smoke flows** (deferred): three to five flows on a simulator and an emulator,
   nightly or before a release, for what only a real WebView and real native code can show.

**The E2E suite is its own Nx project, `apps/web-e2e`, with an implicit dependency on `web`.** Not
specs under `apps/web` — its Jest config has no `testMatch`, so it would collect them — and not a
harness in `libs/bridges`, whose single barrel ships in product code.

**The fake shell is the real bridge host with fake handlers.** The mobile app's `AppBridgeHost` runs in
the test process; a Playwright transport replaces the WebView (`page.exposeFunction` in,
a `message` event dispatched with the reply string out — on `window` for the iOS project and
`document` for the Android one, as react-native-webview does). Envelope rules, `NOT_FOUND` for an
unhandled message and the WebAppReady handshake are therefore production code. The handler table is
typed so a handler returns the payload of the reply `WEB_MESSAGE_RESPONSE_TYPE` pairs with its request,
and the reply's `type` is taken from that map: a contract change in `@chatic/app-messages` breaks the
fixtures at compile time.

**The page gets the mobile app's own injection script**, loaded at run time rather than imported, and
the shell answers the cache messages from memory, because inside the app the web stores its cache
there.

**The backend is fixtures.** Every `VITE_*` endpoint points at a `*.test` host, which never resolves;
the relay's HTTP API and socket are answered by tables, and a request with no fixture is refused and
listed on the test report rather than failing the test.

**Two engines:** WebKit with an iPhone profile stands in for iOS, Chromium with a Pixel profile for
Android. Every scenario runs on both. The first scenarios are the two that were last verified by hand:
the boot splash handoff and the attachment picker.

**CI runs it as a separate `e2e` job in `verify.yml`,** when `web-e2e` is affected or the mobile
injection script changed.

## Alternatives

- **Pointing the suite at the dev backend.** It needs accounts, a network and a server whose data
  changes under the test, and a red run would no longer say whether the web broke. The guest flow was
  recorded against it once to learn the message shapes; the fixtures are written from those shapes
  with invented values.
- **A hand-written reply function instead of `AppBridgeHost`.** Simpler to read, but it would restate
  the envelope rules — `refId` matching, the `NOT_FOUND` answer, buffering events until the web is
  ready — and could disagree with them without anything noticing.
- **Testing the web in a plain browser tab.** Nothing to fake, but the native mode is the subject: the
  cache, the pickers, the handshake and the fallbacks for older apps all take a different path there.
- **Detox, Appium or Maestro as the pull-request gate.** They run the real app, which is what tier 3 is
  for, but each needs a native build, a simulator or emulator and a macOS runner for iOS, and takes
  minutes per flow. As the gate on every pull request the cost is out of proportion; as a nightly smoke
  it is not.
- **Importing the mobile injection script statically.** The obvious form, and it type checks the
  arguments. But Nx then records a dependency on `@chatic/mobile`, `nx sync` adds it to this project's
  TypeScript references, and typecheck — which runs dependencies' typecheck first — would build the
  mobile app, whose typecheck is red and excluded from CI. The run-time load keeps that edge out. What
  replaces the type check is partial: the shell fails a test when the script reports an injection
  error, which catches a missing argument that makes the script throw, not one that is silently
  `undefined`.
- **A production build served by `vite preview`.** Closer to what ships (minification, the
  production-only module aliases), but it adds a full build before the first scenario on every run.
  The dev server was chosen; the build-only differences are a stated limit.
- **Failing a test on any request the fixtures do not answer.** Strict determinism, but every feature
  that adds a read would break unrelated scenarios. Unanswered requests are refused and reported
  instead.

## Consequences

- **The fixtures are a second description of the relay.** A socket frame or HTTP shape that changes on
  the server has to change here too; until it does, the suite passes on a shape the server no longer
  sends. The socket frame table is keyed by string — the sockets library's packet registry is not
  exported from its package entry, so it cannot be typed the way the bridge table is.
- **The cache in memory is an approximation** of the app's SQLite queries: scope, channel filter,
  `chatNo` order and cursor. Text search and the per-channel preview read are not implemented; the
  latter answers `NOT_FOUND`, which the web handles as it does for an older app.
- **What it cannot see is listed in the module doc's Limits:** a WKWebView or Android WebView
  difference, any real native code, whether the app's own handlers answer as the fixtures assume, and
  build-only differences. Tiers 1 and 3 are planned for the first three.
- **The CI job names the mobile injection script by path** to trigger on it, because of the missing
  dependency edge described above. Any other mobile file a scenario comes to rely on needs the same.
- **Every pull request that affects the web pays for the job:** installing two browsers with their
  system packages, starting the dev server, and about half a minute of scenarios at two workers.
