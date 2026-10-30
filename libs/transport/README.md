# @chatic/transport

**The connections, and nothing that decides when to use them.** `SocketManager` holds one socket
client per slot — relay, the committed cloud, and a background slot per other joined cloud — behind
an active facade; `HttpManager` resolves each HTTP route's host, signs through the one lemon transport
and knows when the signing credential has lapsed. It was cut out of `@chatic/app-runtime` as the layer
above `@chatic/session` (ADR-0253): it reads the session, and nothing in app-runtime.

Which slots should exist, who logs a slot in, and what a cloud switch does are not here. Those are
app-runtime's — the React host and the binders in its `connection/`, the authentication wiring in
`socket/auth/` — and the sync runtimes are [`@chatic/sync`](../sync/README.md)'s.

## Who imports it

`@chatic/app-runtime` and the modules cut from it that sit above this one. **Apps do not**: they reach sockets and HTTP
through `runtime` — `runtime.connection.getSocketManager()`, `runtime.boot.webTransport`,
`runtime.session.authFailureReaction` — which publishes the parts an app is meant to hold.

Production code imports the barrel only. A test in app-runtime may name a file —
`jest.mock('@chatic/transport/socket/runtime', …)` — because a mock has to replace the module every
importer reaches, this package's own modules included, and mocking the barrel would leave those on
the real module. The root eslint config closes both forms to everything else, and app-runtime's own
config re-opens the barrel and, in tests only, the deep form. This package reads `@chatic/session` the
same way: the barrel in code, a named file in a test that mocks a store.

## Layout

```text
libs/transport/src/
├── index.ts                   the package barrel
├── socket/   14 files · 10 tests   SocketManager, its slots and contract, failure reporting, link state
└── http/      6 files ·  5 tests   HttpManager, the sealed transport, gateways, two late-bound registries
```

The barrel sells the modules the layers above import, whole. A module nothing above imports stays
inside: `SocketManager` (a test constructs one by its path), `HttpManager`, `http/factory`, the
failure reporter, the error-code ledger and `annotateSocketError`.

## Rules

1. **One creation point each.** `getSocketManager()` and `getHttpManager()` are lazy process
   singletons. A second `new` for either is a bug; a test that needs a fresh `SocketManager` builds
   one by its file path.
2. **Nothing here refreshes a credential or builds an `auth.update` packet.** The SDK's auth
   controller owns both. Two tests in app-runtime walk this package's source along with the rest and
   fail on the string: `refreshAbsence.test.ts` and `authUpdateAbsence.test.ts`.
3. **Nothing here reaches upward.** What the runtime above has to supply — recovering a lapsed
   credential, reacting to a final refusal — is a registry it fills at boot (`credentialRecovery`,
   `authFailureReaction`), and an empty registry does nothing.
4. **`socket/types.ts` holds no values.** The barrel exports it whole, so a value there would ship
   to every runtime module. Values go in `socket/constants.ts`.

## Documents

| Doc                                     | Covers                                                                                                                                             |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [docs/socket/](./docs/socket/README.md) | `SocketManager`. Slot keys, the active pointer and its escapes, device identity, state, request timing, close reasons, failed requests, link state |
| [docs/http/](./docs/http/README.md)     | `HttpManager`. The three routes, the sealed transport, the staleness port, the two late-bound registries, gateways and the log sink                |

## Testing

```bash
npx jest --config libs/transport/jest.config.js
npx tsc -b libs/transport/tsconfig.json
```

The jest config maps `@chatic/assets`, styles and images the way app-runtime's does: the session
stores read `storage` from the `@chatic/shared` barrel, and that barrel carries React components.
