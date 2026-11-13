# @chatic/runtime-mobile

**The native adapter: the runtime for React Native's JS process.** On the phone the session, the
sockets, sync and the data layer can run in the app's own process instead of the WebView's page. This
package holds the pieces that are true of that process and of nothing else — NetInfo, `AppState`, a
socket opened by React Native with the handshake header the relay checks — and builds the runtime from
them. It is the native counterpart of [`@chatic/runtime-web`](../runtime-web/README.md).

The mobile app does not boot it yet: today the page owns the session on every platform. The package
exists so the native side can be built and tested on its own first.

```ts
// The app's entry file, first line — before anything that draws random numbers is loaded.
import '@chatic/runtime-mobile/polyfills';

import { createNativeRuntime } from '@chatic/runtime-mobile';

// after the app's config and logging are set up
const engine = createNativeRuntime({
    storage: { secret, plain, device }, // the app's own stores, on its native storage
    cache, // the app's `LocalCachePorts`
    userAgent: await getUserAgent(), // the string this device reports everywhere
    leaveToHome: params => {
        /* the app's way home when a session ends */
    },
    signedOutKeyPrefixes, // optional
    data, // optional
});
```

| Export                                   | Does                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `createNativeRuntime(options)`           | checks the polyfill, fills the native ports (below), calls runtime-core's `createRuntime`, returns the engine |
| `@chatic/runtime-mobile/polyfills` entry | installs `crypto.getRandomValues` on the OS's secure random generator; imported first, once                   |

The ports `createNativeRuntime` fills, the same in every React Native app:

| Port                      | Filled by (`src/`)        | With                                                                                                                          |
| ------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `RuntimePorts.transport`  | `nativeTransportPorts()`  | NetInfo's `isConnected`; `Platform.OS` and the app's user agent; `new WebSocket(url, protocols, { headers: { User-Agent } })` |
| `RuntimePorts.foreground` | `nativeForegroundPorts()` | `AppState`: in front unless `background`; a subscriber hears only a change of that answer                                     |
| `RuntimePorts.auth`       | `nativeAuthPorts()`       | the parameters the last session ended with, carried in the plain store to the next boot; the app's `leaveToHome`              |

`storage` and `cache` are the app's. The app is to build the stores on the device's secure store and its
native key-value store and the cache on its native database — app code with native modules of its own,
none of it written yet. The package takes them as they are and decides nothing about them.

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
module, and `createNativeRuntime` throws at boot when it is missing — a `Math.random` fallback would
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

- Tagged `layer:adapter` and `platform:native`: it may not import `@chatic/app-runtime` (the React
  surface), React, or a `platform:web` package such as `@chatic/runtime-web`. See
  [the layers](../runtime-core/README.md#layers).
- Nothing in the runtime imports it. The app's entry does, and passes what it builds into the assembly.
- It compiles without the DOM's types or Node's (`tsconfig.lib.json`); React Native's own types supply
  its globals.
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
