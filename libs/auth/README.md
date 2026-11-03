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
├── session/   11 files · 8 tests   the relay and cloud sessions, token exchange, teardown, the SDK delegate's material
├── pairing/    6 files · 6 tests   device pairing: the request flow, paired clouds, the secondary-device check, errors
├── socket/    19 files · 17 tests  booting, re-authenticating, renewing and ending the socket slots' sessions
└── utils/      2 files · 2 tests   Coalescer · Throttle — the concurrency guards the renewals use
```

`Coalescer` and `Throttle` sit here because the guards they generalise were auth's; app-runtime's
hooks that share them depend on this package anyway.

## Rules

1. **The use cases are the only writers of the session.** `@chatic/session`'s barrel sells the raw
   stores so that this package can write them; nothing above writes a store directly.
2. **No server call bypasses a repository.** Login, token exchange and site selection go through
   the `AuthRepository`, which `initAppRuntime()` hands down (`authRepositorySource`) because the
   graph that holds it is assembled in app-runtime.
3. **Nothing here refreshes a credential or builds an `auth.update` packet.** The SDK's auth
   controller owns both; app-runtime's `refreshAbsence.test.ts` and `authUpdateAbsence.test.ts` walk
   this package's source and fail on the string.
4. **Sync is beside this package, not below it.** The eslint config refuses `@chatic/sync`, and sync's
   refuses this package.
5. **`socket/types.ts` holds no values.** The barrel exports it whole.

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
