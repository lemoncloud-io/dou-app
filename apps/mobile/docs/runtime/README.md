# runtime — the session, run by the app

On every launch so far the page in the WebView has held the session: it signs in, keeps the tokens,
opens the sockets and reads the cache. The app can hold it instead, in its own JS process, with
[`@chatic/runtime-mobile`](../../../../libs/runtime-mobile/README.md) — the same runtime code a page
runs, on the app's own storage and network. This document is how the app does that: who decides, how
the runtime starts, and what it keeps running.

**Nothing turns it on yet.** The owner is `web` unless a development setting says otherwise, and the
handshake that would start the runtime for a page (`RuntimeHello`) is not answered by this build. The
pieces below are in place so the handshake and the page's side can be built on them.

| File (`src/app/services/runtime/`)           | Role                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `sessionOwner.ts` · `launchSessionOwner.ts`  | Who owns the session this launch, read once from its own MMKV file                       |
| `nativeRuntimeHost.ts`                       | The host: boots and runs the runtime once per process, reports a session's end           |
| `nativeRuntime.ts`                           | The app's one host, wired to the app's services — loaded only when the runtime is wanted |
| `runtimePorts.ts` · `runtimeStorageFiles.ts` | The runtime's stores and cache on the app's vault, MMKV files and SQLite                 |

## Who owns the session

`launchSessionOwner()` answers `web` or `native`, read from the `sessionOwner` key of the MMKV file
`chatic-runtime-mode`. Anything but an explicit `native` — no file, no key, a value this build does not
know, a file that cannot be opened — is `web`, which is what every launch was before.

**It is settled once per launch.** The first read is kept for the process: a page that reloads and asks
again has to hear the same owner, and the logs of one run must agree. `writeSessionOwner` therefore
records the owner for the _next_ launch.

Every native log entry carries it as the `sessionOwner` context field (`nativeLogContext.ts`), so a
run's entries say which side held the session.

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

A start that fails answers `null`. A failed boot created nothing, so the page keeps the session. A run
that fails after the boot stops what it had started; the runtime then exists without running, and no
side runs the session for the rest of that launch — the log says which of the two happened.

## The device, as the page knows it

The runtime uses the ids the app injects into its pages — `DeviceInfo.getUniqueIdSync()` and the
Firebase installation id — so the server sees one device whichever side holds the session. Push
registration fetches the token the way the page's `FetchFcmToken` does (`acquirePushToken`: the APNs
token on iOS, the FCM token elsewhere) and keeps its record in the same `pushRegistration` preference.

What the page keeps in its own storage does not move yet: the selected cloud, the cloud identities and
the other plain session values start empty in the runtime's file. Carrying them over belongs with the
switch that turns the runtime on.

## When a session ends

A sign-out leaves the address a page would navigate to (`logout=1` among it) in the runtime's plain
store for the next boot, and calls the host's way home. The host logs `session.native_ended` and tells
`onSessionEnded` listeners; taking the person home is the WebView's, so the bridge host that answers the
page is the one to listen.

## What is not done yet

These are the conditions the steps that turn the runtime on have to meet. None of them matters while
nothing starts it.

- **A session's end needs a fresh runtime.** A page drops everything it held in memory by reloading — the
  repository graph, the sync engine, the background clouds, the outboxes. The runtime has no reload, so
  after `onSessionEnded` the app has to stop it and start the JS context over before the next account
  signs in; until then that memory would carry into the next session.
- **One side at a time.** The page and the runtime each keep their own copy of the vault's tokens. If
  both ran a session, a token one side rotated would leave the other's stale, and one side's later
  write could undo the other's sign-out. A page must not boot a session of its own while the runtime
  runs one, and the app must not say it holds the session before `start()` has answered an engine.
- **Logout markers do not cross owners.** The "the vault clear was not confirmed" marker sits in each
  side's own plain store. A launch owned by one side does not see the other's, so the owner must not
  change while one is set.
- **A locked vault holds `start()`.** It waits for the first unlock; an answer to a page must not wait
  on it unbounded.
- **The paired-cloud check** — which ends a paired cloud with a toast and a sign-out — has a screen in
  it and runs only with the page today. On a launch the runtime owns, nothing runs it; where it lives
  is to be settled before the runtime is turned on.
