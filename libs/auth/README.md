# @chatic/auth

**Getting a session, keeping it, and ending it.** Logging in, entering a cloud, renewing a lapsing
credential on every socket slot, signing a device in from another device, and tearing a session down
— the use cases that write the stores in [`@chatic/session`](../session/README.md), and the wiring that
authenticates the slots of [`@chatic/transport`](../transport/README.md). It was cut out of
`@chatic/app-runtime` as the last layer below the app (ADR-0253), beside [`@chatic/sync`](../sync/README.md):
neither imports the other.

What a screen mounts to use any of this is not here. The hooks — `useLogin`, `useSwitchCloudSession`,
the two credential guards, the pairing hooks — are app-runtime's
([its session doc](../app-runtime/docs/session/README.md)).

## Who imports it

`@chatic/app-runtime`, whose `session` and `connection` facade groups and hooks are built on it. **Apps
do not**: they reach the session through `runtime.session`. The barrel sells the session writers and
the renewers, which an app must not reach around the use cases; the root eslint config closes the
package to apps and to the libs outside the runtime stack, and the packages below it refuse it in
their own configs.

Production code imports the barrel only. A test in app-runtime may name a file —
`jest.mock('@chatic/auth/socket/bootstrapSocketConnection', …)` — because a mock has to replace the
file every importer reaches, this package's own modules included. This package reads
`@chatic/session` and `@chatic/transport` the same way.

## Layout

```text
libs/auth/src/
├── index.ts                    the package barrel
├── platform.ts                 the ports the platform fills: the address, and the way home at logout
├── testing/platform.ts         `fakeAuthPorts()` — a jsdom page's ports, for tests in any package
├── session/   13 files · 9 tests   the relay and cloud sessions, token exchange, teardown, the SDK delegate's material
├── pairing/    6 files · 6 tests   device pairing: the request flow, paired clouds, the secondary-device check, errors
├── socket/    20 files · 18 tests  booting, re-authenticating, renewing and ending the socket slots' sessions
└── utils/      2 files · 2 tests   Coalescer · Throttle — the concurrency guards the renewals use
```

`Coalescer` and `Throttle` sit here because the guards they generalise were auth's; app-runtime's
hooks that share them depend on this package anyway.

## Rules

1. **The use cases are the only writers of the session.** `@chatic/session`'s barrel sells the raw
   stores so that this package can write them; nothing above writes a store directly.
2. **No server call bypasses a repository.** Login, token exchange and site selection go through
   the `AuthRepository`, which `createRuntime()` hands down (`authRepositorySource`) because the
   graph that holds it is assembled in app-runtime.
3. **Nothing here refreshes a credential or builds an `auth.update` packet.** The SDK's auth
   controller owns both; app-runtime's `refreshAbsence.test.ts` and `authUpdateAbsence.test.ts` walk
   this package's source and fail on the string.
4. **Sync is beside this package, not below it.** The eslint config refuses `@chatic/sync`, and sync's
   refuses this package.
5. **`socket/types.ts` holds no values.** The barrel exports it whole.
6. **Nothing here imports `@chatic/bridges`.** The eslint config refuses it, type-only imports
   included, and `logger` comes from `@chatic/logger`. Signing in and keeping a session alive must
   not need a WebView bridge to exist, so this package can run in a runtime that has none.
7. **Where the app is open comes through `authPlatform`, and there is no default.** Ending a session
   is a navigation in a page, and the boot reads the flag it carries back off the address; a native
   process has neither. So `AuthPlatformPorts` ([`platform.ts`](./src/platform.ts)) has two:
   `currentSearch()` — the address's query string, which the boot sweep and `preserveUrl` read — and
   `leaveToHome(params)` — the navigation at the end of `clearAndRedirect`. In a page
   (filled by `createWebRuntime` in `@chatic/runtime-web`) they are `location.search` and
   `location.replace('/?<params>')`. Used before it is configured, `authPlatform.ports()` throws and
   names `createRuntime`; the boot sweep reads it outside its storage `try`, so a missing wiring fails
   the boot rather than skipping the sweep.

    The user agent the socket signature is computed over is **not** an auth port: it is the transport's
    `device().userAgent`, the value a native socket sends on its handshake. The server checks the two
    against each other, and one source is what keeps them equal.

    One browser read is left: a logout in a shell whose vault was unavailable earlier also clears the
    tokens that run left in the tab's `sessionStorage` (`WebStore.session()` in `relaySession.ts`). It
    only runs when the secret store is the shell's vault, and outside a page `WebStore` answers with a
    memory store, so it does nothing there.

8. **Nothing here reads a page.** The package compiles without the DOM's types (`lib: ["es2022"]` in
   `tsconfig.lib.json`) and the root lint refuses the page's globals, because it runs in the native
   process too; what the platform answers comes through rule 7's ports and the transport's.

## Documents

| Doc                                                | Covers                                                                                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [docs/session/](./docs/session/README.md)          | The use cases: relay and cloud sessions, the token exchange and its cache, teardown                                                          |
| [docs/pairing/](./docs/pairing/README.md)          | Device pairing: the request flow, paired clouds and their checks, the secondary-device rule                                                  |
| [docs/socket/](./docs/socket/README.md)            | Staying authenticated on every socket: who owns what, the status truth table, booting, re-auth, renewal, background tokens, ending a session |
| [docs/socket/signing.md](./docs/socket/signing.md) | The per-server `authId` / signature / writeback contract                                                                                     |

## Testing

```bash
npx jest --config libs/auth/jest.config.js
npx tsc -b libs/auth/tsconfig.json
```
