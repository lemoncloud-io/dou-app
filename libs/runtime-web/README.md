# @chatic/runtime-web

**The web adapter: the runtime for a web page.** The browser and the desktop shell run the session,
the sockets, sync and the data layer in the page. This package holds the pieces that are true of a page
and of nothing else — the page's stores, its `navigator.onLine`, a socket opened by the page — and builds
the runtime from them.

```ts
const stores = resolveStorageStores(); // or a browser-only app's own stores
runtime.boot.initAppRuntime(
    createWebRuntime({
        storage: { secret: stores.secret, plain: stores.plain, device: stores.device },
        cacheTab: stores.webSession,
        signedOutKeyPrefixes, // optional: the keys this app's domains say a sign-out takes
        data, // optional: the app's repository and cache policies
    })
);
```

| Export                          | Does                                                                                                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createWebRuntime(options)`     | fills the page's ports (below), calls runtime-core's `createRuntime`, and returns the engine for `initAppRuntime(engine)`                                                               |
| `createBridgedRuntime(options)` | the engine of a page whose phone shell owns the session — see [A page that mirrors its shell](#a-page-that-mirrors-its-shell)                                                           |
| `webMirrorPort(client?)`        | the mirror's port over the page's bridge: `RuntimeCall` and `RuntimeSubscribe` (with `RUNTIME_CALL_TIMEOUT_MS`), `RuntimeUnsubscribe` and the two runtime pushes; made before the hello |
| `settleSessionOwner(options)`   | who holds the session this launch, settled before the entry point boots either runtime — see [A page that mirrors its shell](#a-page-that-mirrors-its-shell)                            |
| `resolveStorageStores(env?)`    | chooses and builds every store an app keeps state in, for its environment — see [The stores](#the-stores)                                                                               |
| `readStorageEnvironment()`      | what that choice depends on: in a shell, the shell keeps a vault, a late vault already confirmed                                                                                        |
| `LATE_VAULT_MARK`               | the tab mark apps/web writes when a shell turns out to keep a vault only after its handshake                                                                                            |
| `setNativeCacheSupport(report)` | the phone shell's cache capability, which the cache routing reads; called by apps/web after the bridge handshake, before the data graph is built                                        |
| `xhrPut`, `createXhrPut()`      | `@chatic/data`'s `PutPort`, handed to `useSendImages`: the page's own `XMLHttpRequest` PUT — the browser's and the desktop app's sender, and the phone app's for a page file            |

The ports `createWebRuntime` fills, the same in every web app:

| Port                      | Filled by (`src/`)             | With                                                                                                                                                                     |
| ------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RuntimePorts.transport`  | `webTransportPorts()`          | `navigator.onLine` and the window's online/offline events; `window.CHATIC_APP_PLATFORM` and `navigator.userAgent`; `new WebSocket(url, protocols)`                       |
| `RuntimePorts.auth`       | `webAuthPorts()`               | `location.search`; `location.replace('/?<params>')` at the end of a session                                                                                              |
| `RuntimePorts.foreground` | `webForegroundPorts()`         | `document.visibilityState` and the document's `visibilitychange` event                                                                                                   |
| `RuntimePorts.cache`      | `webLocalCachePorts(cacheTab)` | each cache domain in IndexedDB, in the phone shell's SQLite across the bridge, or in `cacheTab` (a plain tab's invited clouds); see [docs/cache](./docs/cache/README.md) |

They are not on the barrel: an app takes the whole set through `createWebRuntime`, so a forgotten port is
not possible. The four apps that boot the runtime — web, desktop-web, admin and the landing site — call it
from their entry point.

### A page that mirrors its shell

On a phone launch whose shell runs the session, the page builds no runtime of its own:
`createBridgedRuntime({ hello, port })` returns runtime-core's mirror engine (`createMirrorEngine`) over
the page's bridge, built from the session the shell's `native` answer to the page's hello carried.
Nothing is wired in the page — no stores, sockets or cache — and every member reaches the shell's
runtime as runtime-core's [docs/bridge](../runtime-core/docs/bridge/README.md#the-pages-half-the-mirror-engine)
describes. It is the counterpart of `createWebRuntime`, never called alongside it: one launch has one
owner. The web app's entry point builds it once `settleSessionOwner` has settled on the shell (below).

**The port is made before the hello** (`webMirrorPort()`). The shell pushes the session from the moment
it answers, and the mirror exists only after the answer arrives; the port keeps the newest push heard
with no one listening — with the signals of every push before it, so a sign-out in between is not lost —
and hands it to the mirror when it subscribes.

A runtime call or subscribe waits `RUNTIME_CALL_TIMEOUT_MS` (60 s) rather than the bridge's 10 s
default: a call can be a socket round trip or a cloud switch with its own deadline inside the runtime,
and a subscribe the page gave up on would stay open in the shell until the next hello, so this only
catches an answer that never comes.

**Settling who owns the session** — `settleSessionOwner({ offer, disabled })`, awaited before the
entry point boots either runtime:

- No offer it can speak (`readRuntimeOffer`: a browser, a shell that does not run its runtime, an
  offer in none of the page's contracts), or `disabled` — the page's own switch → `web`, at once and
  without a message to the shell. The shell starts its runtime only on a hello, so a page that never
  asks leaves the launch as it always was.
- Otherwise it makes the port (`webMirrorPort`), then says `RuntimeHello` with the page's contracts,
  each wait `SESSION_OWNER_HELLO_TIMEOUT_MS` (10 s — the shell holds a hello up to 5 s while its runtime
  starts). `web` or `NOT_FOUND` → `web`; a complete `native` answer → `native`, with the contract, the
  session and the port for `createBridgedRuntime`.
- Anything else settles nothing (`settleRuntimeHello`) and is asked again after 0.25, 0.5, 1 and then
  every 2 s, for `SESSION_OWNER_GIVE_UP_MS` (30 s). The limit counts only time the page is shown
  (`visibleClock`) — the bridge's own timeouts pause while it is hidden, and a launch sent to the
  background, or one waiting for the device's first unlock, has not been failing meanwhile — and no
  hello outlasts it: the last waits only for what is left, `SESSION_OWNER_LAST_HELLO_MIN_MS` (1 s) at
  the least.
- `RUNTIME_CONTRACT_MISMATCH` — the shell already holds the session under a contract this page does not
  speak — is not asked again: nothing but another page can change it.
- Unsettled, it answers `{ sessionOwner: null }` and logs an error: the page then boots **neither**
  runtime. Booting its own is not a way out — the shell may hold the session, and the page would be a
  second owner — so the entry point shows an error with a reload, which asks the shell again from a
  fresh page.
- **What the page cannot see.** The offer reads the same whether or not the shell already holds the
  session, so a page that does not ask — `disabled`, or one sharing no contract with the shell — cannot
  tell. Reloaded into a process whose shell answered `native` earlier, it would boot a second session.
  So both take effect from the next app process; closing the gap needs the shell's offer to say it
  holds the session.

### The stores

`resolveStorageStores()` is the one place an app's stores are chosen and built. An entry point that uses
it (apps/web and apps/desktop-web) calls it once and hands the result out — to `prepareSecretStorage`, to
`createWebRuntime({ storage })`, to its config ports and its own features — instead of constructing stores
itself. admin and the landing site run in a browser tab and nowhere else, and hand over their own.

| environment                 | secret     | plain      | device   | tab        |
| --------------------------- | ---------- | ---------- | -------- | ---------- |
| shell with a vault          | vault      | webLocal   | webLocal | webSession |
| shell from before the vault | webLocal   | webLocal   | webLocal | webSession |
| plain browser tab           | webSession | webSession | webLocal | webSession |

Plain state follows the session: inside a shell it must survive the WebView being relaunched, in a
browser it ends with the tab like the sign-in does. `device` is `localStorage` everywhere; `device` and
`tab` are tolerant, for the features' convenience state, and a cache that must hear a failed write takes
`webSession` instead.

What else still has a browser answer inside a package moves here as its wiring becomes a port:

- `@chatic/auth` — at logout, the tokens a run without the vault left in the tab's `sessionStorage`
  (`WebStore.session()` in `session/relaySession.ts`); a no-op outside a page.
- `@chatic/http` — its own `navigator.onLine` read for failure attribution; it sits below transport,
  so it cannot read the transport's online port.

## Rules

- Tagged `layer:adapter` and `platform:web`: it may not import `@chatic/app-runtime` (the React
  surface), React, or React Native. See [the layers](../runtime-core/README.md#layers).
- Nothing in the runtime imports it. An app's entry point does, and passes what it builds into the
  assembly.
- It holds the readers, not their meaning: what an `online` false means for the link, or which
  platform a user agent is, stays in the package that declared the port.
- Its tests run in jsdom, because these are a page's readers (`src/transport.spec.ts`).
