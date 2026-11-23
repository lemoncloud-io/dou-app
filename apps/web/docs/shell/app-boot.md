# app boot — the order `main.tsx` runs in, and what breaks if it moves

`src/main.tsx` is a straight line of steps. Most of the order is load-bearing: a step placed earlier
or later does not fail loudly, it loses data or reads a value that is not there yet.

## Before the runtime starts

1. **Log wiring comes first.** The bridge logger, the console listener, the log context and the log
   uploader are attached before anything can log. The log queue is filled by a hub subscription, so
   an entry dispatched before it lands nowhere, and the context is stamped at dispatch, so an entry
   written before it carries none. Nothing logs above this block and nothing may be moved above it.
   The build flags (`VITE_LOG_UPLOAD_DISABLED`, `import.meta.env.DEV`) are read in `main.tsx` and
   passed in, because a runtime module that touched `import.meta` could not be loaded by the test
   transform.
2. **The run-id join is reported right after, as the first entry of the run.** It says whether the
   native and web halves of this launch share a run id, so it needs the queue to be listening. It is
   silent when the join is intact, and a plain browser always is.
3. **Stores are chosen once.** `resolveStorageStores()` builds the session's secret and plain ports,
   the device vault where the shell keeps one, and the `device` and `tab` stores features write
   through ([app-storage-and-device-info.md](../state/app-storage-and-device-info.md)). It reads only
   what the shell injected and the tab's own mark, so it is safe this early. The chosen set is also
   handed to the debug panel, so its Storage screen shows and edits the stores this run really uses.
4. **The theme mirror is synced before config is initialised.** `syncThemeFromSharedKey` writes the
   durable `vite-ui-theme` value into `ui.theme`'s own storage, and config reads that storage once,
   during `hydrateStorage()` inside `init()`. Run after `startRuntime` and the first read would see the
   old mirror ([theme.md](./theme.md)).
5. **Whether `localStorage` already held session tokens is recorded before anything can sign in.**
   Only a run without a vault writes them there, and the late-vault step below needs to tell those
   apart from a copy an older app left behind.

## `startRuntime`

The page declares what it runs (`web-hybrid` inside a shell, `web-browser` in a plain tab, in
`src/config/`); `startRuntime` then does, in this order:

1. `config.init` with the declaration's ports, synchronously — before any lazy setting read.
2. Publishes the host's ports, once, before anything that renders could read one.
3. Builds the engine. Inside a shell it first settles **who holds the session** this launch. A shell
   that runs its own runtime offers it before the page runs; on a `native` answer the page mirrors that
   runtime and builds no ports of its own: no secret store, no sockets, no cache. Without an offer (a
   browser, a shell that does not run its runtime) the page owns the session at once. On a launch the
   page owns, the device vault is loaded and anything left in `localStorage` moved into it before the
   runtime boots, so every read after that is synchronous.
4. `initAppRuntime` with that engine. It must sit after the log wiring (the boot can log) and before
   anything that can read the session. It touches no network. The relay store throws rather than guess
   when its resolvers are missing, so a line moved above it fails loudly instead of signing requests
   against an empty host.

Each port's choice is logged as `app.runtime_port`, together with the `port.*` toggle that changed it.

If the owner could not be settled, **neither runtime boots**: the shell may hold the session, and a page
that ran its own would be a second owner. The page says so and offers a reload. A browser tab's engine
settles nothing, so there the page holds the session. A failure that is not a settle problem (a
declaration that cannot resolve, a port that throws while it is built) is logged under its own tag and
thrown on, so nothing renders on a runtime that never came up.

## The late vault

A shell can keep a vault without having said so before the page ran: it lists `StorageGet` in the
handshake reply, but the boot global that announces the vault did not land. Moving the session into
the vault in the middle of a run would race token writes and skip the boot's own sign-in decision, so the
page marks the tab and reloads once, and the next boot takes the vault from the start. Tokens this run
wrote to `localStorage` before it knew are removed first (they would replace the vault's session at the
next boot); a copy that was already there at boot is left for that boot to move. This only applies on a
launch the page owns; on one the shell owns the vault is the shell's. A vault the shell could not read
at launch (on iOS, before the first unlock) is the same case in reverse: when the page is shown again
and the vault now answers, the page starts over on it.

## After the runtime has booted

- **Sign-out duties.** A composer draft, the locked rooms and the notification inbox belong to the
  signed-in person, so each is cleared by a session logout callback and the next account on the device
  never opens onto them. On a launch the shell owns, the shell's runtime cannot reach the page's storage,
  so the page also drops its own signed-out keys at every sign-out and at the boot that follows one
  (`?logout=1`, where the shell restarts the page). The session tokens in `localStorage` go too: on such
  a launch they can only be a copy no page has moved, and the next launch the page owns would let that
  copy replace whatever the vault holds, signing the person back in to the account they left.
- **The crash sentinel and the report drain** come after the log uploader, which owns the only log
  store. A session that died without a clean `pagehide` is logged as a page crash; it carries no buffer,
  because the dead run's entries reach the collector through the batch uploader on their own. Reports
  the native side detected while the web was down (WebView crash, RN exception, native crash) are
  drained into the log pipeline.
- **The boot cover has a cap.** The cover in `index.html` lifts when the first screen paints
  ([boot-cover.md](./boot-cover.md)); `bootSplash.armCap` is the guarantee that a boot which never gets
  there still shows whatever it did render, an error or a stalled gate, instead of an endless blank. It
  is generous on purpose (10 s) and is not a budget; the native shell lifts its own splash on a shorter
  cap.
- **Statistics are decided once.** Performance traces and usage events go through the same pipeline as
  logs, under a sampling policy read once for the whole run, before the vitals and the first traces so
  they are recorded under it. With the default policy nothing is recorded. The development override
  lets a policy be tried before the server serves one; a production build ignores it. Trace
  destinations are only known when the `WebAppReady` reply says whether the installed app records
  traces, so until then traces are held and replayed. Request observers start early enough to include
  the boot burst, and the held samples from the bridge are capped so they cannot crowd the boot traces
  out of the hold.
- **The native `OnNavigate` capture is armed before the handshake.** The native side buffers a cold-start
  push tap until the web signals readiness, and the router that handles it mounts much later.
  `pendingNavigationStore.start()` runs first so the flushed event is held instead of dropped, and only
  then does the page send `WebAppReady`. Log relays do not count as readiness on the native side; this
  call is the real signal.
- **The `WebAppReady` reply is a capability report, not an ack.** This web build can be newer than the
  app it runs inside, so what the installed shell can persist and handle is asked rather than assumed. It
  is recorded before render, so it is available when the data runtime creates its cache storages; an
  unrecorded answer falls back to the fixed set of cache types every supported shell stores. The call
  never rejects, so it cannot break boot in a plain browser. The viewer shows no save or share until the
  report lands. The late-vault check and the install's session-owner default (what the app should use
  next start for an install nobody switched, sent on every boot, so a web deploy is what moves
  production installs onto the app's runtime and back) hang off the same reply, as does the app-icon
  usage statistic, which is only started where the shell lists `FetchAppIcon` and after the handshake,
  because a request posted before it can reach the app ahead of its router.
- **The native debug menu is forced off on every web start** (`setDebugMode(false)`), right after the
  handshake so it rides the same buffered flush to a native side that is certainly listening. Entering
  the debug menu is a per-session action afterwards. No stage escapes this call; it also clears a flag
  that older installed builds still read.
- **The phone fields' remembered country** moved from its own key into `ui.phoneCountry`. It is carried
  over once, after the runtime has started (so the setting can be written) and before the first render,
  its only reader.

## Global error listeners (`app.tsx`)

- A cross-origin script error arrives with a null `event.error` and the opaque message "Script error.".
  The `Error` the page logs is its own, so its stack points at the handler; `errorWasNull` records that, and
  `filename`, `lineno` and `colno` ride along because for an opaque exception they are the only location
  left.
- An unhandled rejection's reason is often a raw DOM `Event` (a WebSocket connect race), which `String()`
  turns into `[object Event]`, so the reason is converted before logging.
- Resource load failures (`img`, `script`, `link`) fire on the element and do not bubble, so only a
  capture-phase listener on `window` sees them. There is no `Error`, so one is built that carries the
  element and URL.
- CSP violations never reach `window.onerror`; a blocked script inside the WebView is a prime
  correlate of a "Script error." entry, so they are listened for separately.
