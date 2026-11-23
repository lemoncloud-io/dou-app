# host adapters — what the web's own `src/config/` decides about the shell

`src/config/` holds the two declarations the page boots from and the adapters they use. For how a port
is chosen and what the toggles do, read [host ports](../bridge/host-ports.md); this page keeps the
behaviour inside the adapters that is easy to break by "simplifying" it.

## The two declarations

- **`web-hybrid`** is the page inside a shell (the phone app's WebView, or the virtual shell that plays
  it). The session sits on the stores the entry resolved (the device vault where the shell keeps one,
  `localStorage` in a shell from before the vault). The engine is `engine.mirror`: before any port is
  built it settles who holds the session, mirroring the shell's runtime when the shell takes it and
  running the page's own otherwise. `VITE_SESSION_MIRROR_DISABLED` stops it asking, unless the shell
  says it already holds the session. Each host port defaults to what the shell declared; a `port.<name>`
  toggle may move one to the page (`.browser`), or to the shell only where it declared it does
  (`.shell`). `config` keeps the shell's lane: settings the shell holds are read from the boot bag and
  written back over the bridge.
- **`web-browser`** is a plain tab, where only the page can hold the session. The engine is the core, so
  there is nothing to settle or mirror; ports answer what a browser can do and have no alternatives
  (`.shell` is never supported without a shell, `.browser` is already the answer); checkout hands over to
  the website; `config` has no shell lane because a tab has nobody to round-trip a write to.
- The entry picks one once, from the host profile's finding of a bridge at boot. Storage, config and the
  declaration are therefore never told apart by two different reads.

The engine adapter records the session owner for the log context and the performance pipeline the
moment it is known, which is the last point before the boot that knows it.

## Behaviour worth keeping

- **Haptics are one-way posts.** The shell plays them without answering; a reply would be a trip back
  across the bridge on the UI thread in the middle of the gesture that asked for it.
- **The icon badge has two sources.** iOS answers the live icon badge, which the app process can read.
  Android has no readable badge (the badge API resolves a constant 0 off iOS), so the count is read from
  the app's shared counter with a separate message. A refused round trip can arrive as `success: false`
  rather than a rejection; either way the value is unknown (`null`), never a number.
- **A store purchase answers later, as an event.** `Purchase` does not reply with the result; the shell
  pushes `OnPurchaseSuccess` or `OnPurchaseError`, which are listened to for as long as the port lives.
  One purchase waits at a time: starting another settles the first as `superseded`, as a store sheet
  replaces another. A purchase is given up as `timeout` after 60 s, and the timer belongs to its own
  entry, so it cannot settle a later purchase. A cancellation is logged as an ordinary outcome, not an
  error, because filing it as one would misread the purchase funnel. A tier change must carry `oldPlanId`:
  on Android the shell reads the replacement mode from old-versus-new plan rank, and without it the store
  books a brand-new subscription.
- **A purchase on the website** leaves the app for a page and completes there; the page learns of it from
  the membership. `replace` takes the current history entry's place, so back from the website skips it.
- **Picking and sharing wait on a person.** The bridge budgets are long on purpose: a picker stays open
  as long as the person browses (30 min) and answers after every copy is written (ten videos are copied
  after it closes); a prepared photo and an attachment read are bounded at two minutes, a video
  conversion at ten (a 4K minute converts in tens of seconds, several in a few minutes). Opening or saving
  a file on iOS answers only when its sheet or preview closes, so that wait is long as well, and a share's
  items (which Android copies after opening the app) get ten minutes. A shorter clock would drop the
  answer.
- **Android never asks for the camera itself** when a capturing file input is tapped: without the
  permission it opens nothing and the page hears nothing. The page asks first, which is how a refusal
  reaches it at all.
- **Provider sign-in has no clock.** The request fires and the answer is listened to apart from it,
  because the person may take as long as they like at the provider's screens; the app reports every
  outcome (credential, cancel, failure) as an `OnOAuthLogin` message. Listeners are wrapped, because the
  client keeps them in a set and the same function subscribed twice would share, and lose with, the
  first subscription. Linking awaits the same flow as one request under the long budget. Sign in with
  Apple is offered on iOS only. A sign-in the app got through a pairing approval makes it a secondary
  device that signs out with its approver.
- **The transfer module is one per page.** Every waiting upload has to be reachable from the one event
  listener, so it is created on first use rather than with the port, which is built again on every start.
  The page's own PUT (`src/config/upload.ts`) is a browser tab's sender and the one for files the shell
  does not move itself.
- **Cache routing keeps the raw tab store.** The tab store passed to cache routing is the entry's raw
  `webSession`, never the tolerant `tab` features use, because a cache must hear a failed write instead of
  swallowing it. Routing decisions are made once by the data assembly and the debug panel's DB screen
  shows exactly those, not a fresh `route()` answer.
- **The resolved storage port is one set of objects.** `storage.resolved` uses the stores
  `resolveStorageStores()` chose, not the runtime's own `storage.vault`, `storage.local` or
  `storage.tab` adapters, each of which builds store objects of its own and would split the session,
  config's session lane and the cache's tab rows across copies.
- **Diagnostics kind is read before the ports are published.** Logging is wired before `startRuntime`
  publishes ports, so the log pipeline cannot call `runtime.diagnostics` yet; `diagnosticsKind` answers
  from the same frozen host profile, once. While the resolver's own warning is being stamped the answer is
  the `browser` it is about to return, rather than a second resolution.

## Config port callbacks

- A **duplicate registry key** is a registry authoring error and is logged only; a test asserts the set
  is empty, so it is loud in collected logs and silent where it would only confuse.
- A **refused shell write** (after the retry) is logged **and shown** with a toast. The person just did the
  thing, and a refusal means the setting silently did not stick: the screen would say it is off while it
  is not. The imperative `toast` is used because the callback runs from `config.set`, outside React.
- These live apart from `configPorts.ts` so they can be tested without the build's `import.meta.env`
  values; `viteEnv.ts` is the one module under `src/config/` that touches `import.meta`, for the same
  reason. The adapters import the bridge modules by direct path for that reason too: the `bridge` barrel
  pulls the web transport and its `import.meta.env`, a syntax error under the CommonJS test transform.
- The shell's key-value adapter reads the boot envelope live (`CHATIC_APP_CONFIG_BAG`) instead of asking
  over the bridge, because the bag must be in hand before `config.init()` runs, before any request could
  answer. It is read on each call, since the shell may write it again while the page runs.
