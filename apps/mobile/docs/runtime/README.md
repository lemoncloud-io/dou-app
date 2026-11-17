# runtime — the session, run by the app

On every launch so far the page in the WebView has held the session: it signs in, keeps the tokens,
opens the sockets and reads the cache. The app can hold it instead, in its own JS process, with
[`@chatic/runtime-mobile`](../../../../libs/runtime-mobile/README.md) — the same runtime code a page
runs, on the app's own storage and network. This document is how the app does that: who decides, how
the runtime starts, and what it keeps running.

**A dev or production build runs it by default; the web can send installs back to the page.** 0.32.0
was the first app version that carried the runtime, and it shipped switched off in production. From
0.32.1 a production build starts every install nobody switched on the runtime, as the dev build already
did; the web build can name the page instead for those installs, from their next start, without an app
release (see [The page's default](#the-pages-default)). The owner switch still moves one install either
way, answered in production only while the app's debug mode is on (see [The switch](#the-switch)). On a
launch whose owner is `native`, the app offers the session to the page
and answers the runtime handshake; the web page says hello and, on the `native` answer, mirrors the
runtime (`settleSessionOwner` and `createBridgedRuntime` in `@chatic/runtime-web`). It then opens no
vault and runs no session of its own, so while the page asks, only one side holds the session's tokens
(one that does not ask is under [What is not done yet](#what-is-not-done-yet)): the runtime says it
holds the session only once `start()` has answered an engine and never tells a later page `web`, and the
page boots its own runtime only on a `web` answer. A page that cannot settle the owner in 30 s of being
shown boots neither and shows an error with a reload.

The same runtime also answers a mini app in the sub WebView on such a launch — reads, and with
`chatSend` one text send, of the current cloud, through a whitelist and a runtime bridge host of each page load's own (see
[the sub WebView](../webview/sub-webview.md)). On a launch the page owns, a mini app reads nothing.

| File (`src/app/services/runtime/`)           | Role                                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `sessionOwner.ts` · `launchSessionOwner.ts`  | Who owns the session this launch, read once from its own MMKV file                                        |
| `nativeRuntimeHost.ts`                       | The host: boots and runs the runtime once per process, reports a session's end                            |
| `nativeRuntime.ts`                           | The app's one host, wired to the app's services — loaded only when the runtime is wanted                  |
| `runtimePorts.ts` · `runtimeStorageFiles.ts` | The runtime's stores and cache on the app's vault, MMKV files and SQLite                                  |
| `runtimeOffer.ts` · `runtimeBridge.ts`       | The offer injected into the page, and the four runtime requests answered over the host                    |
| `restartOnSessionEnd.ts`                     | A session's end restarts the JS context, which opens the WebView home                                     |
| `sessionOwnerSwitch.ts`                      | The owner switch: records the owner and restarts to apply it; offered outside production or in debug mode |

## Who owns the session

`launchSessionOwner()` answers `web` or `native`, read from the `sessionOwner` key of the MMKV file
`chatic-runtime-mode`, where the switch records a choice. With no choice recorded — no key, or a value
this build does not know — it is the page's default from the `defaultSessionOwner` key when the web
build named one ([The page's default](#the-pages-default)), and otherwise the build's own
(`defaultSessionOwner`):

| Build (`VITE_ENV`)                 | Install nobody switched |
| ---------------------------------- | ----------------------- |
| `DEV` (the DoU Dev app)            | `native`                |
| `PROD`                             | `native` (from 0.32.1)  |
| `LOCAL`                            | `web`                   |
| A value the build cannot recognise | `web`, always           |

The stage is the baked `VITE_ENV`, not where the page is served from: a local run whose `apps/mobile/.env`
says `DEV` is a dev build, and starts on the runtime like the DoU Dev app — and, without the runtime's
service settings in that file, falls back to the page on every launch with a failed start in the log.
A build can name its default instead with `VITE_SESSION_OWNER_DEFAULT` (`web` or `native`); the device
scenarios pin their builds to `web` that way, so a fresh install starts where their switch step expects
it. A build whose stage cannot be recognised — an env file that failed to load, which also lacks the
runtime's service settings — ignores it and keeps the page. The order is: the switch's recorded choice,
then the build's pin (`VITE_SESSION_OWNER_DEFAULT`), then the page's default, then the stage's own
(`unswitchedSessionOwner`). So an install switched to the page stays there whatever the web names, and a
scenario build pinned to the page is not moved by a web build that names the runtime. A file that cannot be opened reads as `web` on every
build: a setting the app cannot read must not move the session.

An install that ran the page before it got a build with this default — every production install updating
from 0.32.0 — moves to the runtime on its first launch of that build. What it kept in the page's plain storage does not come along (see
[The device, as the page knows it](#the-device-as-the-page-knows-it)): the selected cloud starts empty
once, as after a switch.

**It is settled once per launch.** The first read is kept for the JS context: a page that reloads and
asks again has to hear the same owner, and the logs of one run must agree. `writeSessionOwner` therefore
records the owner for the _next_ launch. A launch here is a JS context, which the app can also start over
itself (`services/appRestart`, below) — such a restart reads the owner again, and is how a change takes
effect without the person relaunching the app.

Every native log entry carries it as the `sessionOwner` context field (`nativeLogContext.ts`), so a
run's entries say which side held the session. The log-pipeline copies of the shell's `boot` and
`first_screen` traces carry `session_owner` too, but from what the app answered the page's hello
(`settledSessionOwner`), so a launch whose runtime could not start counts as the page's (libs/perf
README, `ambientAttributes`).

### The switch

The web's debug overlay has a **Session owner** screen. It asks the app with `FetchSessionOwner` (this
run's owner, and the one recorded for the next start) and `SetSessionOwner`, which records the owner and,
when it differs from this run's, restarts the JS context a moment later — after its answer has reached
the page, which the restart reloads.

Every build registers the two requests (`useSessionOwnerHandler`, answered by
`sessionOwnerHandlers.ts`); whether they are answered is decided on each request
(`isSessionOwnerSwitchAllowed`):

- **A local or test stage build** answers them always. The stage is the baked `VITE_ENV` read through
  `toEnvStage`; a value the build does not recognise — an env file that failed to load — counts as
  production. The stage rather than `__DEV__` is the gate so that the stage builds testers install,
  which are release builds, have it too.
- **A production build** answers them only while the app's debug mode is on — the overlay's own unlock
  (ten taps on the Lab page and the entry code), which the app records in its debug settings
  (`debugModeEnabled`). That is how internal testers move a production install onto the runtime. While
  it is off both requests are refused with `NOT_ALLOWED` and the screen says the switch is not offered.
  The app does not check the unlock itself: it takes the flag from the page's `SetDebugMode`, which the
  overlay sends only after its unlock, so a page cannot move the session without first turning debug
  mode on.

**Debug mode gates changing the owner, not keeping it.** A production install moved onto the runtime
stays there until someone unlocks debug mode again and moves it back, or the app is removed (the owner
file goes with the app's data). It cannot follow the debug flag instead: the page turns the app's flag
off on every boot (`main.tsx`), so the switch would last one launch.

### The page's default

The switch moves one install, by hand. `SetDefaultSessionOwner` is the web's word for every install
nobody switched: the web build carries `VITE_APP_SESSION_OWNER` (`web` or `native`), and the page sends it
on every boot once the app's `WebAppReady` reply lists the request (`runtime/sessionOwnerDefault.ts` in
`apps/web`). The app records it under `defaultSessionOwner`, beside the switch's own key, which it never
overwrites (`createDefaultSessionOwnerHandler`, registered with the switch by `useSessionOwnerHandler`).

- **Any build answers it, production included, with no debug mode.** It is the rollback for the runtime
  being the production default: a web deploy naming `web` sends real installs back to the page, with no
  app release and no store review. An install whose session the page never moved into the vault gets it
  back on that launch ([An install that skipped the page's move](#an-install-that-skipped-the-pages-move)).
- **It takes effect from the next start and never restarts.** The owner is settled once per launch, so the
  launch that hears it keeps its owner. An install therefore moves two starts after the deploy at the
  earliest: one to hear the new value, one to run on it.
- **A launch whose owner could not be settled sends it too**, without asking the app first: that launch
  never reaches `WebAppReady`, and it is the one a rollback must reach — a runtime that stops answering
  the page leaves installs on the error screen, and a web build naming `web` moves their next start back.
- **A build that names nothing sends `null`**, which clears what an earlier web build recorded, and the
  install falls back to the build's own default. Removing the setting is a rollback of the setting, not a
  no-op. A web build with `VITE_SESSION_MIRROR_DISABLED` names `web`: it does not mirror a shell that holds
  the session, so it does not send the next start there either.
- **Deploys read it from a repository variable**, `WEB_DEV_APP_SESSION_OWNER` or
  `WEB_PROD_APP_SESSION_OWNER`, which the deploy workflows write into the web's `.env`. Changing the
  variable does nothing until the next web deploy.
- An app from before 2.28.0 of the bridge does not list the request, and the page sends it nothing.

The screen's **This page** row says what the page settled at boot — its own session, or mirroring the
runtime. It is the row that tells a working switch from a launch whose runtime could not start (a build
without the runtime's services): **This run** says App (native) for both. The device scenarios switch
through this screen with `--session-owner native` (release `device-verify.md`).

The vault's tokens are the same keychain item for both owners, so a session carries over a switch. What
each side keeps in its own plain storage — the selected cloud, the cloud identities — does not yet. The
device guest's id crosses through the vault; see [The device, as the page knows it](#the-device-as-the-page-knows-it).

## Starting the runtime

`nativeRuntimeHost.start()` boots and runs the runtime once per process; later calls answer the first
call's engine. On a launch the page owns it answers `null` and touches nothing.

The host lives outside React, in a module, so it outlives anything the WebView does: a page reload or a
WebView content-process restart leaves the session and its sockets standing. Its module
(`nativeRuntime.ts`) imports the whole runtime, so **nothing on the app's startup path imports it** —
whatever starts the runtime loads it then. A launch the page owns pays one MMKV read and nothing more.

The boot, in order (`bootNativeRuntime` in runtime-mobile):

1. **The build's values.** The runtime's config needs the session's services by the names the web's env
   files use — `VITE_PROJECT`, `VITE_HOST`, `VITE_OAUTH_ENDPOINT`, `VITE_SOCIAL_OAUTH_ENDPOINT`,
   `VITE_BACKEND_ENDPOINT`, `VITE_DOU_ENDPOINT`, `VITE_WS_ENDPOINT`, and `VITE_ENV`. The endpoints are
   in `.env.example` as blanks, to copy from the web app's env of the same stage — which means each
   stage's values now live in two env files that have to agree. A build missing any of them fails the
   boot before anything starts: the host logs `session.native_runtime_failed` with the missing names,
   answers `null`, and the page keeps the session.
2. **The vault**, waited for while it is locked (iOS, before the first unlock).
3. **The secret store**, loaded through the page's own secret-storage step, which also finishes a logout
   whose clear was never confirmed. Unlike a page's boot, it is never told "this launch follows a
   logout": a page's `?logout=1` belongs to the one document the logout opened, while the app's saved
   address outlives the logout as long as the process runs on, and a guest signed in after it would
   otherwise lose its tokens at the next launch. The logout itself empties the vault before it ends.
4. **The runtime**, created with the loaded stores, the app's user agent (the string the WebView
   reports) and the host's way home.

Then the host runs it (`runNativeRuntime`), as a page's runtime host does on mount: the session
controller (a guest stays signed in), the connection controller (background clouds at once, the sockets
once the session is ready), the relay and cloud credential guards (checked again on each return to the
front), and push registration. Each return to the front also probes the sockets and asks each verified
background cloud for its delta, at most once every five seconds, as a page does — a socket the OS
suspended with the app may be dead without knowing it. `session.native_runtime_started` logs how long
the boot took and what the vault held.

A start that fails answers `null`, and the page keeps the session. A failed boot created nothing; a run
that fails after the boot stops what it had started, so the runtime exists without running. The log
says which of the two happened.

## The device, as the page knows it

The runtime uses the ids the app injects into its pages — `DeviceInfo.getUniqueIdSync()` and the
Firebase installation id — so the server sees one device whichever side holds the session. Push
registration fetches the token the way the page's `FetchFcmToken` does (`acquirePushToken`: the APNs
token on iOS, the FCM token elsewhere) and keeps its record in the same `pushRegistration` preference.

What the page keeps in its own storage does not move yet: the selected cloud, the cloud identities and
the other plain session values start empty in the runtime's file. Carrying them over is not done: an install
that moves to the runtime starts them empty once.

The device guest's id is the exception, because without it the invited clouds an account accepted are
hidden from it and a new invite cannot be accepted. It is kept in the vault as well as in the plain
store, and a launch the page owns copies it from the page's storage into a vault that lacks it
(`libs/session` README, `identityStore`). The runtime reads it from the vault. So an install that has
had one launch of a page build that copies it has the id on either side. One switched to the runtime
before such a launch reads none until it logs in as a guest, which also writes it. Dev and production
builds accept that gap since they default to the runtime: an install that never ran a copying page
build before it got the runtime default starts without the id, so it does not see the invited clouds
it accepted until it signs in as a guest again. An install that ran 0.32.0 ran the page on its earlier
launches, so it has the id once that web build copies it. Production installs mostly went from 0.31.2
straight to 0.32.1, and those have neither the id nor their tokens in the vault; see the next section.

### An install that skipped the page's move

The tokens reach the vault the same way as the guest's id: a launch the page owns moves them out of the
page's `localStorage` (`secretStorageMigration` in `libs/auth`). Apps before 0.32.0 have no vault, and
production installs went from 0.31.2 straight to 0.32.1, whose first launch is the runtime's. That launch
finds an empty vault and signs the device in as a guest, so the person looks signed out: their own clouds
are gone, and an invited cloud answers `delegate-cloud` with 403. The page, mirroring, never opens the vault,
so the person's session stays in `localStorage`.

The page's move gets it back. A web copy still in `localStorage` next to tokens in the vault can only mean
no page has booted on that vault, so the move lets the copy replace the vault's tokens, and the guest's id
with them, instead of taking the vault as the truth. The install needs one launch the page owns for it,
which a web build naming `web` ([The page's default](#the-pages-default)) gives it from its next start.
Without that move, naming `web` would have deleted the person's session: the vault's guest tokens would
have counted as the truth. The first launch after such an update is the runtime's whatever the web says,
because the app settles the owner before any web build is heard. A sign-out on a launch the runtime owns
deletes that copy as well, so the next launch the page owns does not bring back the account the person left.

## The page's side of the bridge

On a launch the app owns, three things change for the main WebView, and only on such a launch:

- **The offer.** The injected script sets `window.CHATIC_APP_RUNTIME` before the page runs, to
  `{ sessionOwner: 'native', contracts }` (`runtimeOffer.ts`). A page that finds it says hello; a page
  that does not — every launch the page owns — never asks.
- **The four runtime requests** (`RuntimeHello`, `RuntimeCall`, `RuntimeSubscribe`,
  `RuntimeUnsubscribe`) are registered on the bridge (`useRuntimeBridgeHandler`), answered by
  runtime-core's `RuntimeBridgeHost` over the app's runtime (`runtimeBridge.ts`). On any other launch
  they are not registered and answer `NOT_FOUND`, which a page reads as "the session is mine".
- **The vault is refused to the page** once the runtime has started (`ownsSession` on the vault's
  handlers): its tokens are the runtime's from then on.

**The runtime starts at the page's first hello**, not when the app starts: the app takes the session
only when a page that speaks the contract is there to mirror it. A page too old to say hello leaves the
runtime unstarted, and keeps the session itself. The hello waits for the start for at most five seconds
and otherwise answers `RUNTIME_STARTING`, which the page reads as "no answer" and asks again — so a
start held by a locked vault never holds the page.

One `RuntimeBridgeHost` per WebView bridge: it keeps that page's subscriptions, and a page's hello ends
the previous page's. The runtime it answers over is the process's, so a reload or a crashed WebView's
replacement finds the session still signed in. Sizes are counted as the length of a body's JSON (an
approximation of what crosses): a body of 256 Ki characters or more is logged
(`bridge.runtime_payload_large`), and a call's result or a stream's event over 4 Mi characters is
refused. Once a page was answered `native`, the app runs the session until the process ends: a later
page that shares no contract with it is refused (`RUNTIME_CONTRACT_MISMATCH`), never told `web`.

## When a session ends

A sign-out leaves the address a page would navigate to (`logout=1` among it) in the runtime's plain
store for the next boot, and calls the host's way home. The host logs `session.native_ended` and tells
`onSessionEnded` listeners. The page hears it too: the next session push carries the `logout` signal,
which runs what the page keeps for the signed-in person and drops at a sign-out.

**The app then starts its JS context over** (`restartOnSessionEnd`, registered when `nativeRuntime.ts`
loads). A page drops what a session left in memory by reloading — the repository graph, the sync engine,
the background clouds, the outboxes. The runtime has no reload of its own, and it cannot be rebuilt in
place: the packages it wires are process-wide, assembled once per JS context (`createRuntime` refuses a
second call), and each keeps module state of its own. Starting the context over is the one way that
provably drops all of it, so the next account begins on an empty runtime, as a page's next document
does.

The restart goes through `services/appRestart`:

1. It writes a note — `{ reason: 'session-ended', homeSearch: 'logout=1…', at }` — to its own MMKV file
   (`chatic-app-restart`), then reloads with the `AppRestart` native module. `DevSettings.reload` is no
   use here: it does nothing in a release build.
2. The new context reads the note once and removes it. `MainScreen` opens the WebView at the base
   address with that query, so the page boots as a page does after it signed itself out, and the
   runtime's own boot (at that page's hello) reads the flag it saved. The page loads once: the restart
   mounts a new WebView anyway, and it opens at home. **The query is the first load's alone** — it is
   dropped when that load starts. A page booted with `logout=1` empties the vault, so a later mount (a
   retry after a failed load, the WebView back after a link's error view, a custom web build switched
   on) must not repeat it over a session signed in since; it opens the base address.
3. Because the note says the app, not the OS, started this context, the cold-start lookups are skipped
   (`useDeepLinkNavigation`'s `skipColdStart`): the OS still reports the link or push tap that launched
   the process, and the previous context already took it.

Two guards keep a note from being read by the wrong context:

- **A note lasts thirty seconds** (`RESTART_NOTE_TTL_MS`, from the `at` it carries). A reload takes well
  under a second; an older note was left by a context the process died in before its reload landed,
  and the launch that finds it is the OS's — opened by a link or a push tap that must be followed.
- **A context restarts once.** A second restart asked for while the first is under way (two paths can
  end one session) answers the first's result: a second reload would start a third context, with the
  note already taken by the second. The owner switch keeps one pending restart the same way.

A reload that does not happen (no host to reload) takes the note back and logs `app.restart_failed`; the
WebView then stays where it is until the next launch. What a restart costs: the bundle is evaluated
again, the app's services start again, the WebView and any sub WebView are torn down, and the page
boots cold — which a sign-out does anyway. The launch splash is not shown again; the web's own boot
cover is what the person sees.

## What is not done yet

These are the gaps a launch the runtime owns still has. None of them matters on a launch the page owns.
Dev and production builds (from 0.32.1) run the runtime on every install nobody switched, so those
installs meet them on every launch unless the web names the page ([The page's default](#the-pages-default)).

- **The offer does not say whether the session is already held.** A page that does not ask — one whose
  own switch is off, or one sharing no contract with the runtime — cannot tell a launch whose runtime
  already answered `native` from one whose runtime has not started, and only a hello reaches the
  `RUNTIME_CONTRACT_MISMATCH` refusal. Reloaded into the first kind, such a page would boot a second
  session. The offer has to say the session is held (and the page then ask whatever its switch says)
  before a web deploy can be the rollback mid-process.
- **Logout markers do not cross owners.** The "the vault clear was not confirmed" marker sits in each
  side's own plain store. A launch owned by one side does not see the other's, so the owner must not
  change while one is set. The owner switch does not check for one.
- **A restart is recorded as a cold boot.** The boot metrics start over with the JS context, so a
  restarted context sends a `boot` trace and a `first_screen` sample as a launch would; they need a type
  of their own now that production runs the runtime.
- **The paired-cloud check** — which ends a paired cloud with a toast and a sign-out — has a screen in
  it and runs only with the page today. On a launch the runtime owns, nothing runs it; where it lives
  is to be settled now that production runs the runtime.
