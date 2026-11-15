# runtime — the session, run by the app

On every launch so far the page in the WebView has held the session: it signs in, keeps the tokens,
opens the sockets and reads the cache. The app can hold it instead, in its own JS process, with
[`@chatic/runtime-mobile`](../../../../libs/runtime-mobile/README.md) — the same runtime code a page
runs, on the app's own storage and network. This document is how the app does that: who decides, how
the runtime starts, and what it keeps running.

**Nothing turns it on yet.** The owner is `web` unless the development switch says otherwise (see
[The switch](#the-switch)). On a launch whose owner is `native`, the app offers the session to the page
and answers the runtime handshake — but no page asks yet: the page's side of it comes next.

| File (`src/app/services/runtime/`)           | Role                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `sessionOwner.ts` · `launchSessionOwner.ts`  | Who owns the session this launch, read once from its own MMKV file                       |
| `nativeRuntimeHost.ts`                       | The host: boots and runs the runtime once per process, reports a session's end           |
| `nativeRuntime.ts`                           | The app's one host, wired to the app's services — loaded only when the runtime is wanted |
| `runtimePorts.ts` · `runtimeStorageFiles.ts` | The runtime's stores and cache on the app's vault, MMKV files and SQLite                 |
| `runtimeOffer.ts` · `runtimeBridge.ts`       | The offer injected into the page, and the four runtime requests answered over the host   |
| `restartOnSessionEnd.ts`                     | A session's end restarts the JS context, which opens the WebView home                    |
| `sessionOwnerSwitch.ts`                      | The development switch: records the owner and restarts to apply it, outside production   |

## Who owns the session

`launchSessionOwner()` answers `web` or `native`, read from the `sessionOwner` key of the MMKV file
`chatic-runtime-mode`. Anything but an explicit `native` — no file, no key, a value this build does not
know, a file that cannot be opened — is `web`, which is what every launch was before.

**It is settled once per launch.** The first read is kept for the JS context: a page that reloads and
asks again has to hear the same owner, and the logs of one run must agree. `writeSessionOwner` therefore
records the owner for the _next_ launch. A launch here is a JS context, which the app can also start over
itself (`services/appRestart`, below) — such a restart reads the owner again, and is how a change takes
effect without the person relaunching the app.

Every native log entry carries it as the `sessionOwner` context field (`nativeLogContext.ts`), so a
run's entries say which side held the session.

### The switch

The web's debug overlay has a **Session owner** screen. It asks the app with `FetchSessionOwner` (this
run's owner, and the one recorded for the next start) and `SetSessionOwner`, which records the owner and,
when it differs from this run's, restarts the JS context a moment later — after its answer has reached
the page, which the restart reloads.

Only a local or test stage build registers the two requests (`useSessionOwnerHandler`, gated on the
baked `VITE_ENV` read through `toEnvStage`). A value the build does not recognise — an env file that
failed to load — counts as production, so the switch fails closed. A production build leaves them
`NOT_FOUND`, so the screen says the switch is not offered and nothing a page sends can move the session
there. The stage rather than `__DEV__` is the gate so that the stage builds testers install, which are
release builds, have it too.

The vault's tokens are the same keychain item for both owners, so a session carries over a switch. What
each side keeps in its own plain storage — the selected cloud, the cloud identities — does not yet.

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
the other plain session values start empty in the runtime's file. Carrying them over belongs with the
switch that turns the runtime on.

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

These are the conditions the steps that turn the runtime on have to meet. None of them matters on a
launch the page owns, which is every launch but the ones the development switch makes — and on those,
the runtime still waits for a page that says hello.

- **One side at a time.** The page and the runtime each keep their own copy of the vault's tokens. If
  both ran a session, a token one side rotated would leave the other's stale, and one side's later
  write could undo the other's sign-out. The shell's half keeps its side of this — it says it holds
  the session only once `start()` has answered an engine, and never tells a later page `web` — and the
  page's half must keep the other: no session of its own while the runtime runs one.
- **Logout markers do not cross owners.** The "the vault clear was not confirmed" marker sits in each
  side's own plain store. A launch owned by one side does not see the other's, so the owner must not
  change while one is set. The development switch does not check for one.
- **A restart is recorded as a cold boot.** The boot metrics start over with the JS context, so a
  restarted context sends a `boot` trace and a `first_screen` sample as a launch would; while the switch
  is the only way onto a runtime-owned launch these are a tester's, but they need a type of their own
  before the runtime is turned on.
- **The paired-cloud check** — which ends a paired cloud with a toast and a sign-out — has a screen in
  it and runs only with the page today. On a launch the runtime owns, nothing runs it; where it lives
  is to be settled before the runtime is turned on.
