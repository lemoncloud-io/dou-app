# @chatic/runtime-mobile

**The native adapter: the runtime for React Native's JS process.** On the phone the session, the
sockets, sync and the data layer can run in the app's own process instead of the WebView's page. This
package holds the pieces that are true of that process and of nothing else — NetInfo, `AppState`, a
socket opened by React Native with the handshake header the relay checks — as the adapters an app's
runtime declaration plugs in. It is the native counterpart of [`@chatic/runtime-web`](../runtime-web/README.md).

The mobile app can boot it (`apps/mobile/docs/runtime/`), on a launch whose owner is set to the app;
a dev or production build (from app 0.32.1) sets it for installs nobody switched, unless the web names
the page. A launch whose vault holds no session is declined and goes to the page (from 0.32.2). The app
starts it from its own runtime declaration — `startRuntime`, handed on from runtime-client, over the
adapters below, in `apps/mobile/src/config/mobile.ts` — and keeps it alive with `runNativeRuntime`:

```ts
import '@chatic/runtime-mobile/polyfills'; // first, before anything draws random numbers

const { engine } = await startRuntime(declaration); // the app's `mobile(...)` declaration
const stop = runNativeRuntime(engine, { deviceIds, push });
```

No library chooses a React Native app's ports for it: a choice made here would be made for every such
app at once and could change only with a build, while a declaration is read by its own app alone
(ADR-0343).

| Export                                                                    | Does                                                                                                                                                             |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@chatic/runtime-mobile/polyfills` entry                                  | installs `crypto.getRandomValues` on the OS's secure random generator; imported first, once                                                                      |
| `nativeTransportPorts({ userAgent })`                                     | the transport port (below); one NetInfo listener for the process however often it is built                                                                       |
| `nativeForegroundPorts(appState?)`                                        | the foreground port (below), on React Native's `AppState` unless handed another                                                                                  |
| `nativeAuthPorts({ plain, leaveToHome })`                                 | the auth port (below): the address carried in `plain`, read and removed once when it is built                                                                    |
| `nativeStoragePorts({ vault, files, secret? })`                           | the storage port: `nativeSecretStore` on the vault, `keyValueStoreOn` on the plain and device files; `secret` not yet loaded                                     |
| `readNativeHostFacts({ userAgent }, platform?)`                           | `NativeHostFacts`, a frozen `{ platform, userAgent }`: `Platform.OS` and the user agent the app resolved before the boot                                         |
| `nativeSecretStore(vault, options?)`                                      | the session's `secret` store on the app's device vault (`DeviceVault`) — the store a page builds, in-process                                                     |
| `waitForUnlockedVault(vault)`                                             | waits while the vault is locked (iOS, before the first unlock) and answers the first other read                                                                  |
| `keyValueStoreOn(file)`                                                   | a `KeyValueStore` on a key-value file (`KeyValueFile`, an MMKV instance), strings kept as they are                                                               |
| `nativeLocalCachePorts(client)`                                           | the cache's `LocalCachePorts`: every domain in the app's database (`NATIVE_CACHE_ROUTE`), through `client`                                                       |
| `missingNativeRuntimeEnv(env)`, `NativeRuntimeEnvError`                   | the build values the runtime cannot start without (`NATIVE_RUNTIME_ENV_KEYS`) that `env` lacks, and the error an app throws before a start when there are any    |
| `loadNativeSession(storage, vault, appState?)`                            | waits for the vault and runs the secret-storage step, or throws `NativeRuntimeNoSessionError` when the vault holds no session; the vault storage adapter runs it |
| `runNativeRuntime(engine, options)`                                       | starts the session and connection controllers, the two credential guards and push registration; returns stop                                                     |
| `createRuntimeBridgeHost`, `RUNTIME_CONTRACTS`, `RUNTIME_LISTENER_MARKER` | runtime-core's, handed on: the shell's half of the bridge and the contract it speaks — the app may not import runtime-core                                       |
| `checkSubWebViewRuntimeRequest`, `subWebViewAllowedFor`, `RuntimeEngine`  | runtime-core's, handed on: the whitelist a sub WebView page's runtime requests pass, and the engine type its bridge is built over                                |

### The adapters

The same factories as values a runtime declaration plugs in (see runtime-client's
[The runtime declaration](../runtime-client/README.md#the-runtime-declaration)); the barrel hands on
`defineRuntime`, `startRuntime`, `requires`, `conflicts`, `defineAdapter` and the declaration types. Each
export is named after its id. A port that sits on one of the app's own native handles is an adapter made
from that handle, because the app opens it. None declares `supports`: each runs in any React Native
process.

| Export                                    | Id                     | Builds                                                                                                                                     |
| ----------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `transportMobile`                         | `transport.mobile`     | `nativeTransportPorts({ userAgent })`, the user agent from the facts                                                                       |
| `foregroundAppState`                      | `foreground.app-state` | `nativeForegroundPorts()`                                                                                                                  |
| `authMobile({ leaveToHome })`             | `auth.mobile`          | `nativeAuthPorts` over the built `plain` store                                                                                             |
| `storageMobileVault({ vault, files, … })` | `storage.mobile-vault` | `nativeStoragePorts`, loaded by `loadNativeSession` — steps 2 and 3 below, so a vault with no session throws `NativeRuntimeNoSessionError` |
| `cacheMobileSqlite(client)`               | `cache.mobile-sqlite`  | `nativeLocalCachePorts(client)`                                                                                                            |

`storageMobileVault`'s `onLoad` hears how the load went — the vault's first answer and the
secret-storage step's row (`NativeSessionLoad`) — once the vault holds a session, and is not called when
the load throws. The package logs nothing about it; the app logs it once the start is done.

`mobileHostFacts({ userAgent })` is the facts reader: `readNativeHostFacts`, after the secure-random
check, since reading the facts is a start's first step. The build-value check and the config set-up are
not part of a start; an app that starts from a declaration does them before it, or names config's ports
in the declaration.

The mobile app starts through these adapters: its declaration (`apps/mobile/src/config/mobile.ts`)
checks the build's values first and names config's ports itself, so the choice of each port is the
app's, as it is for a web app.

Each port has one factory, and each factory builds on its own from what it is handed — nothing reads
another port's result — so an app can declare port by port what it plugs in.

The ports the adapters fill, the same in every React Native app:

| Port                      | Filled by (`src/`)        | With                                                                                                                          |
| ------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `RuntimePorts.transport`  | `nativeTransportPorts()`  | NetInfo's `isConnected`; `Platform.OS` and the app's user agent; `new WebSocket(url, protocols, { headers: { User-Agent } })` |
| `RuntimePorts.foreground` | `nativeForegroundPorts()` | `AppState`: in front unless `background`; a subscriber hears only a change of that answer                                     |
| `RuntimePorts.auth`       | `nativeAuthPorts()`       | the parameters the last session ended with, carried in the plain store to the next boot; the app's `leaveToHome`              |

`storage` and `cache` are the app's: they sit on native modules the app links (its keychain item, its
MMKV files, its SQLite), and the app opens those. What is the same for any app that keeps its state that
way is here, as the builders above — `nativeStoragePorts` and `nativeLocalCachePorts` for the two ports,
over `nativeSecretStore` and `keyValueStoreOn`; `apps/mobile` puts them together in
`src/app/services/runtime/` (`buildRuntimePorts`).

## The stores and the cache

The runtime in the app has to read the state the WebView's pages have been writing, because the
person signed in through a page and their cache was filled by one. So each port is the page's own
store over a different channel, not a new store:

- **`secret` is the page's vault store.** A page keeps the session's four tokens, and a copy of the
  device guest's id, in the device vault
  through `NativeSecureStore` (`@chatic/storage`) and the bridge's `StorageGet`/`StorageSave`/
  `StorageClear`. `nativeSecretStore` is the same class on the same vault, reached in-process: the same
  keychain item, the same keys, so a session a page signed in is the session this runtime reads, with
  nothing to move. It keeps the page's rules with it — values in memory once loaded, writes after and in
  order, and a vault that cannot be read or refuses a write taken as unavailable, never as empty: the
  store holds the session in memory for the rest of the run. A vault that does not answer within
  `NATIVE_VAULT_TIMEOUT_MS` (10 s, the page's bridge budget) counts as one that failed: a keychain call
  that never returns must not hold the boot. Loading it is the boot's, through the same
  secret-storage step a page's boot runs (`prepareSecretStorage`), which also finishes a logout whose
  clear was never confirmed.
- **Locked is waited out, not fallen back from.** On iOS the vault cannot be read until the phone is
  first unlocked after it boots, and the app can be launched in the background before that. A page
  answers that with its tab storage and reloads once the vault reads; a runtime in the app has no reload
  to come back with and nothing to show before the unlock, so `waitForUnlockedVault` asks again each
  time the app comes to the front and the boot loads the store after. Read locked while already in
  front, it asks once more a second later and then only on the next return to the front: each ask is a
  keychain read, and a vault still locked in front does not change by being asked every second. Every other answer (values,
  empty, an error, an undecryptable vault the app reset) comes back at once.
- **`plain` and `device` are files of the runtime's own.** `keyValueStoreOn` keeps the strings a store
  is handed as they are. The app's own MMKV wrapper JSON-encodes, and a store's `clear` empties its
  whole file, so the runtime never shares a file with the app's other values.
- **The cache is the app's database through the page's adapters.** `NativeDBAdapter` and
  `NativeGlobalSearchSource` (`@chatic/db`) take any `CacheBridgeClient` — one `request`, one answer.
  The app builds one over the very handlers that answer the WebView's cache messages, so a page and this
  runtime cannot read or write the cache differently, and the adapters keep their read sharing and
  their metrics. Every domain routes to the database: a page falls back to its own storage only when
  the installed app is too old to hold a domain, and this runtime is the installed app.

Nothing reads `plain` or `device` across from the page yet: a page keeps the selected cloud, the
identities and the device id in its own `localStorage`, and those carry over when the app starts
running the session, not before. The device guest's id is the exception: a page also keeps it in the
vault, so this runtime reads it through `secret` (`libs/session` README, `identityStore`).

## Booting and running

A start boots in the order a page's entry does, and each step is one a page already has. The app's
declaration runs them through `startRuntime` — step 1 in `startMobileRuntime` before the start, the rest
as the start's config set-up and its `storage.mobile-vault` adapter:

1. **The build's values** (`NATIVE_RUNTIME_ENV_KEYS`: `VITE_ENV`, `VITE_PROJECT`, `VITE_HOST`,
   `VITE_OAUTH_ENDPOINT`, `VITE_SOCIAL_OAUTH_ENDPOINT`, `VITE_BACKEND_ENDPOINT`, `VITE_WS_ENDPOINT`,
   `VITE_DOU_ENDPOINT`) are checked, then handed to `@chatic/config` through the same env adapter the web
   apps use, with `CHATIC_APP_PLATFORM` answered by `Platform.OS`. A missing one throws
   `NativeRuntimeEnvError` (its `missing` lists them) before anything starts, so an app that catches it
   leaves the session where it was.
2. **The vault** is waited for while locked (`waitForUnlockedVault`).
3. **The secret store** is loaded through runtime-core's `prepareSecretStorage` — the step a page's
   boot runs. It empties the vault first when an earlier logout's clear was never confirmed
   (`SECRET_LOGOUT_PENDING_KEY` in `plain`). It is never told the launch follows a logout: a page's
   `?logout=1` belongs to the one document the logout opened, while the address the auth port saved
   outlives the logout as long as the process runs on — a guest signed in after it would lose its
   tokens at the next launch — and the logout empties the vault before it ends anyway. The app has no
   web storage behind it, so the step's web copy and tab are empty. When the step leaves the vault with
   no session (`empty`, or `logout-finished`), `loadNativeSession` throws `NativeRuntimeNoSessionError`
   and the start creates nothing: the page takes that launch, and the address a session's end saved is
   removed then — the page hears the same end on its own address, and nothing else would read the saved
   one until a runtime launch days later. Only the page's boot can move a session out of the page's own
   `localStorage`, where an install updating from an app without a vault still has it, and on a
   signed-out install the page signs a guest in as the runtime would have. The next launch finds a
   session in the vault and is the runtime's. A vault that could not be read is not a missing session;
   the runtime runs from the tab then, as before.
4. **The engine**, assembled by runtime-core's `createRuntime` from the loaded stores and the other
   declared adapters.

`runNativeRuntime` then starts what a page's runtime host starts on mount: the session controller
(initialize, keep a guest signed in), the connection controller (background clouds now, sockets once the
session is ready), the relay guard with a page's policy (`NATIVE_RELAY_GUARD_POLICY`: no timer, a forced
refresh on the relay's first verification) and the cloud guard — both checked again on each return to
the front, the relay one only while its socket is verified — and push registration with the app's
delegate. Each return to the front also probes the sockets (`connection.recoverOnResume`) and asks the
background clouds for their deltas (`sync.refreshBackgroundClouds`), at most once per
`WAKE_KICK_THROTTLE_MS` (5 s), as a page does. Its stop undoes them, last first; a step that throws
stops what had started and rethrows.

## Why each port answers the way it does

- **The User-Agent header.** The server checks the socket handshake's `User-Agent` against the one the
  socket signature was computed over, which is `device().userAgent`. A page's `WebSocket` sends the
  browser's by itself; React Native's does not send the app's. So the
  socket factory sends the app's user agent explicitly, and the app passes it in already resolved —
  reading it is asynchronous, and the transport reads it synchronously.
- **Online until told otherwise.** NetInfo answers asynchronously; the port is read synchronously. The
  signal keeps NetInfo's last report and answers online before the first one and whenever NetInfo cannot
  tell (`isConnected: null`) — the same weak positive a page gives with no `navigator`. It reads
  `isConnected` (an interface is up, what `navigator.onLine` means), not `isInternetReachable`:
  reachability is the link verdict's question, answered from the sockets themselves.
- **`inactive` is in front, and only a change of the answer is passed on.** On iOS `inactive` is the
  app still on screen under a system sheet — the control centre, a call, the app switcher on its way.
  The session's retries wait for a return from the background, and that is not one. The port's readers
  (the credential guards, the session controller, push registration) act whenever they are called while
  the app is in front, so a subscriber hears only a flip between in front and `background`; passing on
  each `change` event would run them twice for every pull of the control centre. Before React Native
  knows the state it answers in front: a retry waiting for a return it cannot observe would wait
  forever.
- **The address is carried in the plain store.** A page ends a session over two lifetimes: the
  sign-out clears what it can and navigates to `/?logout=1`, and the next document's boot sweeps the
  app's signed-out keys once more, because the log pipeline can write between the clear and the
  navigation. A native process has no address, so `leaveToHome` saves the parameters in the plain
  store before it calls the app's, and the next boot's `currentSearch` answers them for that whole
  lifetime, reading and removing them once. What "home" is — a reloaded JS context, a reset
  navigation — and dropping the in-memory state a page drops by reloading are the app's, in its
  `leaveToHome`. An app that does not restart leaves the flag for the next launch, where the sweep
  only removes keys already gone.

## The polyfill

Hermes has no `crypto.getRandomValues`, and `uuid` and `crypto-js` draw from it. The polyfill entry
installs it on `react-native-get-random-values`, which asks the OS's secure generator through a native
module, and a start throws at its first step (`mobileHostFacts`) when it is missing — a `Math.random` fallback would
make ids and nonces predictable, and a missing one otherwise fails deep inside a sign-in.

It is the only one the runtime needs. `URL`, `URLSearchParams`, `TextEncoder`, `fetch` and `WebSocket`
are React Native's own. React Native's `URL` is a partial implementation, though, measured on the iOS
simulator under Hermes:

- Its properties are read-only.
- Once `searchParams` has been read, `toString()` appends the parameters to the original URL rather than
  replacing its query, so a URL that already had a query comes out with its parameters twice
  (`wss://host/ws?a=1` → `wss://host/ws?a=1&a=1&v2=`).
- It adds a `/` to a path with no query (`wss://host/ws` → `wss://host/ws/?v2=`); a page's `URL` does not.

The runtime reads `pathname` and adds `v2` to socket URLs, which have no query, so its socket URL here
ends `/?v2=` where a page's ends `?v2=`; the dev relay accepts both. Code that edits a URL with a query
has to build the string itself.

## Rules

- Tagged `layer:adapter` and `platform:mobile`: it may not import `@chatic/runtime` (the React
  surface), React, or a `platform:web` package such as `@chatic/runtime-web`. See
  [the layers](../runtime-core/README.md#layers).
- Nothing in the runtime imports it. The app's runtime modules do (`apps/mobile`'s
  `services/runtime/nativeRuntime.ts`, `runtimeBridge.ts`, `runtimeOffer.ts`), loaded only on a launch
  that runs the runtime, and pass what they build into the assembly.
- Its own source compiles without the DOM's types or Node's (`tsconfig.lib.json`); React Native's own
  types supply its globals.
- One exception it carries knowingly: the cache ports import the `@chatic/db` barrel, which also holds
  the page's IndexedDB and Web Storage engines and reaches `@chatic/bridges`. db is tagged
  `platform:any` until it is split into its web and bridge engines (bridges is genuinely both sides), so
  the `platform:mobile` rule cannot see that edge, and db is compiled with the DOM's
  types (this package type-checks it only through `skipLibCheck`). What runs here is `NativeDBAdapter`,
  `NativeGlobalSearchSource` and the metrics source, which touch no page global — the device check
  covers them — and a DOM use added to `BaseDbAdapter` or those three would fail on a device first.
- Its tests run in jest's `node` environment with each React Native module replaced by the test's own
  mock: no React Native preset, no native module.
- `@react-native-community/netinfo` and `react-native-get-random-values` are native modules. They are
  listed in `apps/mobile/package.json` too, because React Native links only the native modules the app
  itself lists.

## How to verify

```bash
node node_modules/.bin/tsc -b libs/runtime-mobile/tsconfig.json
(cd libs/runtime-mobile && node ../../node_modules/.bin/jest)
(cd libs/runtime-mobile && node ../../node_modules/.bin/eslint .)
```

These run in CI too (`@chatic/mobile` is left out of CI's typecheck; this package is not).
