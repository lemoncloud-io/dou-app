# web-e2e

**`apps/web` running in its native (WebView) mode, in a real browser, against a fake native shell and
a fake relay.** The page believes it is inside the mobile app: `window.ReactNativeWebView` is there
before any of its scripts run, the app's own boot script has set its globals, and every bridge
request it makes is answered by a scripted shell in the test process. Its HTTP requests and its
socket are answered from fixtures. Nothing real is behind either side. A scenario may instead open
the page as a plain browser tab, with the relay faked and no shell ("A browser tab" below).

That is the layer no unit test reaches. A Jest test of a hook mocks the bridge; a by-hand check on a
simulator reaches everything but costs a build and a person. The bugs this suite exists for live in
between — a reply the page does not match, a handshake that lands after the screen needed it, a
fallback that never fires because the old-app answer was never exercised.

## Run it

```bash
yarn web:e2e:install   # once per machine: Chromium and WebKit (CI uses Playwright's image instead)
yarn web:e2e           # the suite, as CI runs it (= npx nx run web-e2e:e2e)
yarn web:e2e:ui        # Playwright's UI mode: pick, run and step through scenarios
yarn web:e2e:headed    # the suite in visible browser windows
```

Playwright starts the web app's Vite dev server on port 5390 (`WEB_E2E_PORT` moves it) with every
`VITE_*` variable given (`src/support/env.ts`): each backend endpoint is an `*.e2e.test` address and
the rest are empty or local, so a developer's own `apps/web/.env` does not reach the page. Locally, a
server already on that port is reused as it is, with whatever environment it was started with; in CI
it always starts its own.

Before the first scenario, `src/support/warm-up.ts` opens the app once in Chromium and imports every
module the app loads lazily (each relative `import('./…')` under `apps/web/src`), again until a pass
ends with no page reload. A cold Vite server compiles
modules and bundles newly found dependencies on first request, and a dependency found that way
reloads the page; without the warm-up, the first scenario of each worker and the first one to open a
lazy screen ran into that and timed out. A failed scenario is not retried, in CI or locally: a test
that passes only on a second attempt is a bug in the test or the app, so fix its cause or delete it
with the reason.

The last two call Playwright directly rather than through Nx, so its own arguments pass through —
one file, one browser:

```bash
yarn web:e2e:headed attachment-picker --project=webkit-ios
```

Every scenario is tagged by what it is for, and each kind has a target of its own. CI steps and agent
skills call these targets by name, so a rename moves them in the same change:

| Command                                | Runs                                                                     | Where                 |
| -------------------------------------- | ------------------------------------------------------------------------ | --------------------- |
| `npx nx run web-e2e:e2e`               | everything but `@visual` and `@load` — the flows and the chaos scenarios | CI, locally           |
| `npx nx run web-e2e:e2e-chaos`         | `@chaos` only ("Chaos" below)                                            | locally               |
| `npx nx run web-e2e:e2e-load`          | `@load` only, three times over, one worker ("Load")                      | locally               |
| `npx nx run web-e2e:e2e-visual`        | `@visual` only, against the Linux baselines ("Visual regression")        | CI, Linux only        |
| `npx nx run web-e2e:e2e-visual:docker` | the same from a Mac, with the browsers in Playwright's Linux image       | locally, needs docker |
| `npx nx run web-e2e:e2e-visual:update` | renders the baselines again, the same way                                | locally, needs docker |
| `npx nx run web-e2e:feature-coverage`  | checks `feature-map.json` and lists the features with no scenario        | CI, locally           |

Each run ends by printing the path of its evidence report ("Evidence report"). A target passes
Playwright's own arguments through after `--`: `npx nx run web-e2e:e2e-chaos -- --project=webkit-ios`.
`yarn web:e2e:headed` and `yarn web:e2e:ui` call Playwright without a tag filter, so on a Mac give
them a file or `--grep-invert @visual` — the visual scenarios only match their baselines in Linux.

A failure leaves a trace and a screenshot in `dist/.playwright/apps/web-e2e/test-results/<test>/`
(`npx playwright show-trace <zip>` replays the run). Beside them, whenever they are not empty, two
lists: `backend-unanswered.txt` (requests no fixture answered) and `shell-not-found.txt` (bridge
messages the shell answered `NOT_FOUND`). Both are also attached to the test's report.

## What is in it

| Path                      | Holds                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/support/fake-shell/` | The shell's Playwright transport and its injection; the core — handler table, in-memory cache, boot answers — is `@chatic/fake-shell`      |
| `src/fixtures/`           | The relay: the guest every scenario signs in as, HTTP routes, socket frames, rooms, invites, clouds, subscriptions (and the shell's store) |
| `src/support/test.ts`     | `test` with `shell` and `backend` in place before the page loads, and the `chaos` and `evidence` fixtures                                  |
| `src/support/app.ts`      | Steps scenarios share: the back button, background and foreground, the history index                                                       |
| `src/support/chaos.ts`    | The `chaos` fixture: faults injected into the relay and the network, and their timeline                                                    |
| `src/support/load.ts`     | Measuring a load scenario: time to visible, heap, scrolling, request counts                                                                |
| `src/support/evidence.ts` | The `evidence` fixture: captioned screenshots and measured numbers attached for the report                                                 |
| `src/fixtures/load.ts`    | Bulk worlds: hundreds of rooms, image messages and the image host that serves them                                                         |
| `src/reporter/`           | The evidence reporter: one self-contained HTML page per run, `summary.json`, `visual-result.json`                                          |
| `src/feature-map/`        | The feature map's check, shared by `feature-coverage` and the report                                                                       |
| `feature-map.json`        | Each `apps/web` feature folder and the scenarios that exercise it                                                                          |
| `scripts/`                | `visual-docker.sh` (visual scenarios in Playwright's Linux image), `pr-verification.mjs` (the run into its pull request) and its test      |
| `src/specs/`              | The scenarios; `chaos/`, `load/` and `visual/` hold the tagged kinds                                                                       |

**Two browser projects, one per platform.** `webkit-ios` emulates an iPhone and the shell delivers
replies on `window`, as react-native-webview does on iOS; `chromium-android` emulates a Pixel and
delivers on `document`, as it does on Android. Each also carries the suffix the app's WebView adds to
the user agent (`DOU_IOS` / `DOU_ANDROID`). Every scenario runs on both.

**Both fakes are installed for every test**, before the page loads anything — a scenario that never
names `shell` or `backend` still runs inside the app, against the fixtures. The one exception is a
scenario that opts into a browser tab (see "A browser tab"), which has the relay and no shell.

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
`@chatic/bridge-messages` breaks the fixtures at compile time instead of leaving a scenario that fakes a
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
`ChaticMessageHandler` relay, the config bag, the safe-area variables and the capability
declaration, which is the app's own for the platform (its store) unless a scenario passes
`capabilities` — `null` for an app built before declarations. The bag has onboarding
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

### An older app

The fake shell injects a current app version (`FAKE_SHELL_APP_VERSION` in `libs/fake-shell`), at or
above the web's version floor. `test.use({ shellAppVersion: '0.29.2' })` installs it as an older app
instead, which is how `app-version-floor.spec.ts` reaches the update screen. Nothing else about the
shell changes: it still answers what a current app answers.

What the app declares it can do is the other half of an older build. `test.use({ shellCapabilities })`
replaces the declaration the shell injects (the `capabilities` above) with what that build sent — as a
fixture function when it depends on `shellPlatform` — which is how `installed-app-declaration.spec.ts`
replays the spellings 0.32.x declares.

### A browser tab

`test.use({ inApp: false })` opens the page as a plain browser tab instead: no shell is installed, so
`isNative()` is false and the page takes its browser paths — the in-app subscription checkout and the
hand-over to the website for managing one are the ones written so far. The relay is faked as before. What the shell's config bag would have set is
written into the browser's own storage, where `@chatic/config` keeps that lane without a shell
(`@chatic/config.<key>`), so onboarding is still done and the debug overlay still off. `shell` is not
set in this mode; a browser scenario that names it fails on the first use.

Two differences from the app shape how a browser scenario is written. A screen's address opened
directly (`page.goto`) boots to home, so a scenario walks to its screen from there; going back to an
entry the app itself made (`page.goBack()`) does land on that screen again. And the
page may leave the dev server for another site: the fake relay answers every host but the dev server,
so a scenario that expects the page to leave answers the destination with `backend.useHttp` and
asserts it with `toHaveURL` — an unanswered destination fails as an unreachable host would. The
project's user agent still carries the app's suffix; `isNative()` reads the bridge, not the user agent,
so a screen gated on it takes its browser path regardless.

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

Three more of the relay's answers exist for the kinds of scenario below. `push(frame)` sends a frame
the relay sends unasked — `chat.sync` with a new message — to every open socket. An HTTP handler may
return a `RawBody` (an image, say) instead of JSON, and a full address ending in `/*` answers
everything under it. And the defaults include the socket SDK's own credential renewal
(`auth.refresh`), which it sends after a refused sign-in; without an answer a session whose sign-in
was refused never recovers, which is a fixture gap, not an app bug.

Fixtures beyond a first launch are opt-in, so a scenario says which world it starts in:
`backend.useSocket(roomsSocket(backend, [dmRoom()]))` adds a relay 1:1 with history, and
`leftDmRoom()` one the guest has left, which the relay still serves, and `longDmRoom(200)` one with a
long history (`fixtures/rooms.ts`). `chat.feed` there pages as the relay does — newest first, below an
exclusive `cursorNo`, `limit` rows (20 when the request names none), and `cursorNo: 0` on the last page
(`feedPage`). `installCloud(backend, …)` installs a cloud with its own backend and socket, with a
second place and its room when asked (`secondPlace`); setting `refuseSwitchInto` on the state it
returns makes `auth.switch` refuse to move into that place. `ownCloud(backend)` signs the guest in as an account
(the relay lets no guest own a cloud), lists that cloud in the relay's catalog as the account's own and
answers the owner's way in — `delegate-cloud`, then the
cloud's `exchange-token` — or refuses it (`issue: false`) (`fixtures/cloud.ts`). `fixtures/invites.ts`
holds the relay invite and the link that carries it. `fixtures/subscription.ts` holds the purchase:
`signedInMember` (a purchase is refused to a guest), `installSubscriptions` (the relay's plans, a
membership that turns active once a purchase is checked, and the check), and `storeHandlers` for the
shell's store, whose `Purchase` answers nothing the page reads — the scenario pushes the outcome
(`OnPurchaseSuccess`, `OnPurchaseError`) as the app does. `fixtures/pairing.ts` holds the requesting device's half of
device pairing: `installPairing` hands out a code with a one-second polling interval, answers each
`claim` as the scenario says, and records the requests, the claims and how many were ever on the wire
at once; `relayApproval` is the approval that carries the account's session. Another host is keyed by its full address (`'GET https://c1.e2e.test/api/hello/invite-code'`) and another socket by its
endpoint (`useSocketAt`; `sentAt` reads one socket's frames, `allFrames` all of them in order). Every socket the page opens is answered here
whatever its host, except the dev server's own; one with no fixture is closed and listed. The fake
cloud keeps the server rule its scenarios are about: a session sits on one place at a time — the one
its token names when it signs in, or the one it last switched to — and a place profile is read and
written there.

## Chaos

`chaos` (`src/support/chaos.ts`) breaks the world around the page, never the page: every fault is in
the fake relay, its sockets or the device's link, and a chaos scenario asserts what a person would
see the app do about it. Each fault goes into a timeline with its time, and a scenario marks what it
saw come back with `chaos.recovered(what)`; the timeline is attached to the test and drawn in the
evidence report. A fault that no request ever met fails the scenario once it has otherwise passed, so
a renamed route or a read the app stopped making cannot leave a chaos scenario green while testing
nothing.

Faults stack: every matching delay is added up, and the first matching refusal, error, hang or drop
decides the answer. `latency` and `failSocket` take an `endpoint` to touch one socket only (a
cloud's); without it they apply to every socket. `dropSocket({ endpoint, downFor })` closes and
refuses that one endpoint's sockets, the relay's by default.

```ts
await chaos.dropSocket({ downFor: 6_000 }); // the relay socket closes; every new one fails for 6 s
await chaos.offline();
/* … */ await chaos.online();
const lift = chaos.latency(1_500, { socket: ['auth.switch'], endpoint: CLOUD.wss });
chaos.failHttp('GET /memberships/0/mine', { status: 503, times: 2 });
chaos.failHttp('GET /clouds/0/list', { hang: true, hangMs: 10_000 });
chaos.failSocket('auth.switch', { endpoint: CLOUD.wss, error: '503 SERVICE UNAVAILABLE - busy', times: 1 });
await chaos.expireToken({ refreshFailures: 1 }); // next sign-in refused as expired, one renewal refused
chaos.recovered('relay socket signed in again');
```

Two choices in how the faults are made decide what a scenario can trust:

- **A refused socket fails the way an unreachable host does.** While the relay is down or the device
  offline, a socket the page opens is connected to its real `.test` address, which never resolves:
  the page sees an error and an abnormal close with no open first. Accepting the socket and closing
  it at once would read to the page as a server that took the connection and hung up, which is a
  different fault, and the socket SDK treats it differently. This relies on the resolver failing
  names under `.test`, as RFC 2606 reserves them; one that answers them (some hijack NXDOMAIN) could
  reach a real host, so the first refusal checks that the relay's socket host does not resolve and
  fails the scenario if it does. A socket that was already open is closed from the server's side
  (1001): a route cannot send the abnormal 1006 a real loss gives.
- **Offline is the page's link, not the browser context's.** `offline()` sets `navigator.onLine` and
  fires `offline` in the page, and the fakes refuse every relay and cloud request; the dev server
  stays reachable, as an installed app's loaded bundle does. `context.setOffline` would also cut the
  dev server in WebKit and bypass the socket routes there, so a module the page loads lazily fails and
  the page lands on its error screen — a fault of the rig, not of the app. The link stays down across
  a reload until `online()`.
- **A request held by a delay does not outlive its connection.** When a delayed socket request's
  connection closes before the delay ends, its handler never runs: a dead connection's request must
  not move the fakes' state (the place a cloud session sits on, say) under the connection that
  replaced it, which the real server would not do either.

The scenarios in `src/specs/chaos/` are on the riskiest flows: a message sent offline, a room entered
while the relay is down, a cloud entry and a place switch on a failing cloud, a credential that
expired in the background, and a cold start whose side reads fail. Where the page may legitimately
take one of two paths — a refused switch retried by itself or rolled back — the scenario asserts the
invariant both must keep (home shows one side only, and agrees with where the cloud holds the
session) and then that trying again gets there.

## Load

The `@load` scenarios (`src/specs/load/`) put bulk data behind the same fake relay — 200 rooms, a
5,000-message room, 200 photos served as real PNGs, 300 messages pushed into an open room — and
measure: time until something is on screen, time per older page, the JS heap (Chromium only; WebKit
does not expose it to Playwright), and how many requests the page made. `evidence.metric(...)` attaches
each number, and the report shows the median over the run's repeats (`e2e-load` repeats each scenario
three times on one worker).

They fail only on correctness — every room reachable and listed once, every loaded message present
once and in order — never on a time. A CI runner and a laptop differ by more than any regression a
budget here could catch; the numbers are for comparing a change against its base on the same machine.
That is also why they are left out of `e2e`, and so out of CI.

What home does after its first paint is the number to watch: it asks `channel.get`, `join.get` and
`profile.get` for the rooms it lists, so the count grows with the list; `room-list.spec.ts` records
the first ten seconds of it.

## Visual regression

`src/specs/visual/screens.spec.ts` compares the main screens on both platforms — relay home, a 1:1,
the empty self chat, MY, the cloud switcher, a cloud home, the subscription guide and the update
screen — with baselines committed beside it in `screens.spec.ts-snapshots/`. The clock is fixed, the
time zone and locale are set, animations are stopped, and each screen waits until the fakes have
been quiet for a second, so the reads a screen makes after its first draw (a row's preview, the
alerts dot) are in.

The baselines are rendered in Playwright's Linux image, the one CI runs, and never on a Mac: fonts
and anti-aliasing differ between the two, so a Mac-rendered baseline fails in CI. From a Mac,
`e2e-visual:docker` runs the browsers in that image (a Playwright run-server in docker, with the
page's localhost tunnelled back to the dev server here) and `e2e-visual:update` renders the baselines
again. The container runs on the machine's own architecture; the CI runners are x86_64, so
`WEB_E2E_DOCKER_PLATFORM=linux/amd64` asks for theirs where the VM can run it. The committed
baselines were rendered on linux/arm64 and compared once on an x86_64 CI runner before they landed
(the pull request that added them says how).

**What a difference produces.** `e2e-visual` exits 1 when any screen differs from its
baseline or has none, and the reporter writes `visual-result.json` beside the evidence folder
(`dist/.playwright/apps/web-e2e/visual-result.json` by default; a run without visual scenarios
removes it):

```json
{
    "status": "fail",
    "compared": 14,
    "failures": [{ "screen": "MY", "project": "webkit-ios", "kind": "diff", "reason": "…" }]
}
```

`status` is `fail` when at least one screen differs (`diff`) or has no baseline (`missing`), and
`error` when scenarios failed only before comparing (a timeout on a loaded machine, say) — a broken
run, not a visual change. The limit is 50 differing pixels per screen; the screens render at the
devices' 3× scale, where a ratio such as 0.1% is about 3,000 pixels and let a changed label through.

`compared` counts scenarios: the cloud scenario holds two screens, and compares the second even when
the first differs. Under GitHub Actions each failure is also an `::error title=visual-regression::`
annotation. The `web e2e · visual` job in `.github/workflows/verify.yml` runs `e2e-visual` and posts the
result as the commit status **`web-e2e/visual-regression`** on the pull request's head: `success` for
`pass`, `failure` for `fail`, `error` for `error` or a run that wrote no result. The job itself stays
green, and the status is not meant to be a required check — a visual change is often the point of a
pull request — and a change to a baseline (`*-snapshots/**`) is for a person to look at.

## Feature map

`feature-map.json` names, for every folder under `apps/web/src/app/features/`, the scenarios that
exercise it (paths under `src/specs/`); a scenario about no single feature is under `crossCutting`.
`feature-coverage` prints the map, lists the features with no scenario — reported, not failed, for now
— and fails when the map has drifted: a feature folder it does not name, a name that is not a folder,
a spec that does not exist, or a spec under no feature. The same check feeds the evidence report,
which colours each mapped spec by its result in that run.

## Evidence report

Every run writes `dist/.playwright/apps/web-e2e/evidence/index.html`: one file, images inline, that an
agent attaches as proof of what it ran. It holds, in order: the run (commit, branch, counts per
platform), what failed, the visual diffs (baseline, actual, difference), the load numbers, each chaos
timeline, the feature map with this run's results, and every scenario with its captioned screenshots
(`evidence.shot(caption)`, JPEG), and a failed scenario's last screen. A passing scenario that takes
no captioned shot shows none: capturing every scenario made the page of one full run over 20 MB.
`summary.json` beside it holds the
same without the images, which go to `images/` beside it as files. `WEB_E2E_EVIDENCE_DIR` moves it. desktop-web-e2e writes the same report,
without the feature map, to its own `dist` folder.

## Verification results in the pull request

`scripts/pr-verification.mjs` puts a run into its pull request. It needs only `node` and `git` (no
install), so a CI job can run it straight from a checkout:

```bash
node apps/web-e2e/scripts/pr-verification.mjs publish --pr <n> --run <run id> \
    --evidence <evidence dir> [--evidence <evidence dir>...] [--dry-run]
node apps/web-e2e/scripts/pr-verification.mjs cleanup --pr <n>
```

`publish` reads each evidence folder's `summary.json` and the images the reporter writes beside it
(`evidence/images/`), and picks at most 24: every visual difference (baseline, actual, diff), one end
state per chaos scenario, and the last screen of each other failure. It pushes them to the orphan
branch `pr-assets/pr-<n>` — replacing its own `web-e2e-*` files and keeping anything else there, such
as the images a pull request body links — and creates or updates one comment, marked
`<!-- web-e2e-verification -->`, titled "Verification results": the verdict, counts per platform,
what failed, the visual diffs side by side, the chaos scenarios with their end states, the load
medians, and every scenario's result. Image addresses carry `?run=<id>` so GitHub does not show a
cached image from an earlier run. `--dry-run` prints the picked files and the comment instead.
`cleanup` deletes the branch, for a pull request closed without merging. The token is `GITHUB_TOKEN` (or
`GH_TOKEN`), which needs `contents: write` and `pull-requests: write`.

The images come from fake-data runs only, which is all this suite has: the repository is public, and
a pushed image stays in git history after the branch is deleted. `npx nx run web-e2e:test` runs the
script's own tests (`node --test`), one of which pushes to and deletes from a local bare repository.

In CI, every `web e2e` job in `.github/workflows/verify.yml` uploads its evidence folder as the artifact
`web-e2e-evidence-<entry>` whatever the result, and the `web e2e · results in the pull request` job runs
`publish` with one `--evidence` per artifact once they are all done. `.github/workflows/pr-assets-cleanup.yml`
runs `cleanup` when a pull request closes without merging; a merged one keeps its branch, because its body
and comment still link the images. A pull request from a fork has no token that can write, so
`publish` and the visual status skip it.

## The scenarios

| Spec                                   | What it pins                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app-version-floor.spec.ts`            | An app below the version floor (`test.use({ shellAppVersion })`) sees only the update screen, the boot cover lifts for it, and Update sends `OpenStore`; an app at the floor opens as usual.                                                                                                                                                                                                                                                                                                                   |
| `boot-splash.spec.ts`                  | The handshake says `holdsBootSplash`; `FirstScreenReady` is posted only once the home route's frame is drawn, read in the page as it is posted; a boot that cannot sign in holds the splash until the 10s cap and then lifts it.                                                                                                                                                                                                                                                                               |
| `attachment-picker.spec.ts`            | "Choose from files" asks the shell (`PickAttachments`, `document`, up to 10); the answer waits in the "Files to send" tray, and Send makes it a file message in the room; a file the shell refused is reported and never sent.                                                                                                                                                                                                                                                                                 |
| `back-navigation.spec.ts`              | On Android, `SetCanGoBack` (marked `includesHistory`) is true exactly while an overlay is open or the app has an entry behind the screen, a back press closes the overlay before it rewinds a screen, and at the app's first entry a press is not spent; on both, an invite link that launched the app sits one entry above home, and back returns there.                                                                                                                                                      |
| `push-navigation.spec.ts`              | A tap that launched the app opens its room with the splash lifted over the room, not home, and home underneath; a tap while the app is open replaces the room on screen and a repeat tap adds nothing; a tap into a 1:1 the guest has left says so and lands on home, leaving one home entry rather than two.                                                                                                                                                                                                  |
| `cloud-invite-entry.spec.ts`           | An invite back into the cloud and place already open switches the session into the place before the profile check, and asks for no profile (the same-cloud regression); an invite into a place with no profile asks for one and saves it on that place.                                                                                                                                                                                                                                                        |
| `oauth-login.spec.ts`                  | Each of the shell's answers to `OAuthLogin` ends the wait: a native token or the virtual shell's relay code (exchanged at `verify-oauth-code`) promotes the guest and returns to MY, a cancel and a failure each say so and leave the buttons usable.                                                                                                                                                                                                                                                          |
| `installed-app-declaration.spec.ts`    | An installed 0.32.2 app declaring every capability in the old spelling (`'app'`, `test.use({ shellCapabilities })`) still signs in through the shell (`OAuthLogin`), not the page.                                                                                                                                                                                                                                                                                                                             |
| `app-resume.spec.ts`                   | Back in the foreground the page asks for the resume cover to come down and the open room shows what arrived while away, on the same screen; a socket the relay dropped meanwhile is opened and signed in again, and the room catches up; a socket left half-open (`backend.silenceSockets()`) is found by the wake probe's ping and replaced within seconds.                                                                                                                                                   |
| `relay-invite-entry.spec.ts`           | A relay invite link opened as the app comes back to the foreground, whose `invite.get` is lost to the socket closing under it, is read again on the next socket once it has signed in, and the invite shows with no failure dialog.                                                                                                                                                                                                                                                                            |
| `chat-paging.spec.ts`                  | A room opens on its newest messages; each scroll to the top asks for 50 more below the oldest one shown (`chat.feed`, `cursorNo`), until the room's first, with every message once and the row being read kept in place. An older page refused is asked for again after 2s, then 4s, with the room intact; one held is asked for once however often the reader scrolls.                                                                                                                                        |
| `cloud-switch.spec.ts`                 | Into an owned cloud and between its two places, home shows only the selected place's room and none of the relay's, the shell's cache keeps each side in its own partition, and DoU Home brings the relay back; a refused cloud entry and a refused place switch are rolled back, and a cloud read landing after the refused entry leaves the relay rooms.                                                                                                                                                      |
| `room-mute.spec.ts`                    | A room muted from the home list while the socket is signing in again shows muted at once, sends nothing until the socket is back, and then sends `join.update` on the new socket; the row stays muted throughout.                                                                                                                                                                                                                                                                                              |
| `room-read.spec.ts`                    | A room the guest opens loses its unread count on the list at once: when the relay fails the `chat.read`, the count stays gone and the read is sent again until the relay has it; when the room is entered while the socket is signing in again, the count goes before the relay could have heard, and the read follows on the new socket.                                                                                                                                                                      |
| `subscription-purchase.spec.ts`        | A completed store purchase is checked with the relay, finished only after that, confirmed with "You are subscribed." and the membership reads active; a cancel says nothing and can be retried; a store error and a pending purchase (the page's own 60s wait) say "Payment failed", and nothing is checked or finished.                                                                                                                                                                                       |
| `subscription-web-checkout.spec.ts`    | In a browser tab: with no subscription, the guide opens the app's own checkout (`/subscription/checkout`) and back returns to the guide; a guest reaches it too and is asked to sign in with Google before any payment call; a running App Store subscription stays, its detail naming the store with no change offered; one the website bills shows its plan by name (read from its provider's list, which the relay keeps out of the unfiltered one), is managed on the website and changes plan in the app. |
| `chaos/offline-send.spec.ts`           | A message sent with no network fails at once, marked "Failed" with Retry, and reaches no relay; once the network is back the socket signs in again by itself, and Retry delivers the message exactly once, on the new socket.                                                                                                                                                                                                                                                                                  |
| `chaos/room-entry-socket-loss.spec.ts` | A room opened while the relay refuses sockets opens anyway with its composer, and once the relay takes the socket again the room fills in on the same screen, with what was written during the outage.                                                                                                                                                                                                                                                                                                         |
| `chaos/cloud-switch-chaos.spec.ts`     | A cloud entry whose switch is refused once on a slow cloud socket settles on one side, never a mix, and gets in; a cloud socket dropped while a place switch is answered leaves home and the session on the same place, and choosing the place again gets there.                                                                                                                                                                                                                                               |
| `chaos/token-expiry.spec.ts`           | A credential that expired in the background is refused at sign-in, renewed over the socket (one renewal refused first), and the session carries on as the same guest — no second device login — with the room caught up.                                                                                                                                                                                                                                                                                       |
| `chaos/boot-http-faults.spec.ts`       | A signed-in cold start whose membership read answers 503 and whose cloud list hangs still draws home, opens a room and opens MY as the account. A guest makes neither read.                                                                                                                                                                                                                                                                                                                                    |
| `load/*.spec.ts`                       | 200 rooms on home; a 5,000-message room paged back ten times; 200 photos; 300 pushed messages ("Load").                                                                                                                                                                                                                                                                                                                                                                                                        |
| `visual/screens.spec.ts`               | Eight screens on both platforms against their baselines ("Visual regression").                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `device-pairing.spec.ts`               | "Sign in with another device" asks the relay for a code as this guest and shows it with its QR; claims go out one at a time, and the approval signs the device in as the account — the socket re-signs on the same connection, the toast names the approver, MY stops asking to sign in. An expired code is struck through; "Get a new code" shows a new one.                                                                                                                                                  |

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
- **Another site the page leaves for is a canned answer.** A browser scenario proves the page left for
  the right address, not what is there — the website's routes, and which of them a production host
  opens, are the landing app's to test.
- **CI runs the suite only when `web-e2e` is affected** — the web app, the libs it builds from, or this
  project — or when the mobile injection script or `.github/workflows/verify.yml` changes. That file is named in the workflow by path,
  because there is deliberately no dependency edge to `@chatic/mobile` (see "The shell"); anything
  else of the mobile app's that a scenario assumes does not trigger it.
- **CI runs each project in a job of its own**, `webkit-ios` and `chromium-android` side by side, in
  Playwright's container image (`mcr.microsoft.com/playwright:v<version>-noble`), which already holds
  the browsers and their system libraries. Installing those on the runner went through its apt
  mirror and now and then took a quarter of an hour. The image tag in `.github/workflows/verify.yml`
  names a Playwright version. When it no longer matches the `@playwright/test` that `yarn.lock`
  installs, the browser revisions that version expects are missing from the image, and the job fails
  naming them and the tag to set. Bumping one means bumping the other in the same change.

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
5. Tag it if it is one of the kinds (`test('…', { tag: '@chaos' }, …)` — or `@load`, `@visual`), and
   add it to `feature-map.json` under the feature it exercises; `feature-coverage` fails until it is.

### Why the fixtures and helpers are written this way

- **Match a name from its start, not as a substring.** A file message is a button whose name starts
  with the file's name; a plain substring also finds the tray's "Remove <name>" button, which once let
  a scenario pass with the file never sent (`roomFile` in `attachment-picker.spec.ts`). Room rows on
  home are anchored the same way.
- **Match toast text exactly.** The toaster repeats a toast's text, prefixed, in a live region, so a
  non-exact match trips strict mode.
- **The catch-all routes use a `RegExp`, not a predicate.** Playwright can pass only a serializable
  pattern to the browser. With a function it intercepts every request and asks the test process about
  each one, which is every module Vite serves the app as (`FakeBackend.install`).
- **Key a "lost on the first socket" fixture on `frame.connection`, not on a count.** The dev server
  mounts the page twice (React StrictMode), so the first socket sees the read twice
  (`relay-invite-entry.spec.ts`).
- **A signed-in member must not be turned back into a guest.** In `signedInMember`
  (`fixtures/subscription.ts`) the place switch answers with a new token that replaces the session's;
  if that token is the guest's, a switch landing after the profile makes the member a guest again and
  MY loses its subscription entry on a slow run.
- **The pairing relay answers `auth.logout`.** Applying a relay approval re-registers the socket on
  the same connection: it signs the guest out and back in as the account. The page does not wait for
  the logout's answer, but an unanswered one would land on the unanswered list.
