# http — routes, the sealed transport, and two late-bound registries

[`libs/http`](../../../http/README.md) owns the executor: building a request, retrying it,
classifying what came back. This folder owns everything that executor cannot know on its own — which
host a route resolves to, which transport signs it, whether the signing credential has already
lapsed, and what the app should do when the server refuses for good.

It is also, by design, **almost a leaf inside this package**, which is what lets `session/auth` and
`data/` both depend on it without closing a cycle.

## Layout

```text
http/                              6 source files, 6 tests
├── HttpManager.ts                route endpoints, the staleness port, the log sink, onAuthFailure
├── factory.ts                    the composition root — the only file here that imports the session
├── transport.ts                  the one lemon transport instance, built lazily
├── gateways.ts                   five lazily memoized HTTP gateways
├── credentialRecovery.ts         registry: "re-mint this route's credential"
└── authFailureReaction.ts        registry: "the server refused for good"
```

There is **no `http/index.ts`** and no `http` facade group. In-package callers import by concrete
path; the three symbols apps do see (`webTransport`, `startWebTransportInit`, `authFailureReaction`)
are re-exported by the `boot` and `session` groups.

`transport.ts` is the one source file here with no test of its own.

## Responsibilities

### Three routes, and no cloud route

```ts
const ENDPOINT_RESOLVERS: Record<HttpRoute, () => string> = {
    relay: () => config.get<string>('net.relay.backend') ?? '',
    oauth: () => config.get<string>('net.oauth.endpoint') ?? '',
    iap: () => config.get<string>('net.iap.endpoint') ?? '',
};
```

A cloud backend is still a destination — `exchange-token` and the invite lookups go to the host the
delegation token names — but those requests carry an explicit `baseURL` and are signed **the relay
way**. Destination and signing method are independent. The cloud route disappeared along with the one
request that ever signed with a cloud credential, the cloud HTTP refresh, and the SigV4 executor and
credential port that served it went with it.

That is also why the staleness adapter answers every route from one owner. `oauth` and `iap` sign
with the relay credential because their hosts have none of their own; the port stays route-keyed to
match the interface, and the mapping lives in one class.

### Nothing here refreshes

[`refreshAbsence.test.ts`](../../src/http/refreshAbsence.test.ts) walks `src/**`, strips comments, and
fails if any code names a refresh endpoint. It replaced an ESLint `no-restricted-imports` rule that
was keyed to a path string and stopped matching — silently — the moment the symbols moved, letting a
violating file pass lint. The absence test has no path to go stale against.

### The sealed transport

`webTransport` is written out by hand rather than proxied, with exactly six methods: `logout`,
`setUseXLemonLanguage`, `buildRequest`, `buildSignedRequest`, `buildCredentialsByToken`,
`getTokenSignature`. **`init`, `isAuthenticated` and `getTokenStorage` are absent** because they are
absent from the sealed type in `@chatic/http` — `isAuthenticated()` in particular fires lemon's own
HTTP refresh, a second refresh engine that updates only lemon's store and leaves the socket's signing
material behind.

The instance is built lazily on first use and read from `@chatic/config` at that moment, not at
module load, so importing this module does nothing — which is what keeps the SDK out of test runs
that do not want it. **Two instances would split the session**, because the lemon token storage lives
inside the instance, so `@chatic/http` exposes a factory with no module state and this file is its
only caller.

Three things ride alongside it, and all three are read-only: `hasStoredRelaySession()` (does a
session exist), `isStoredSessionExpired()` (has the stored horizon passed) and
`resetWebTransportInit()` (used by logout). **Neither probe refreshes anything**, which is the
property that makes them safe to call from a guard.

`startWebTransportInit()` is the boot — lemon's `init` minus its own refresh, single-flighted. It is
awaited by `useRelaySessionInit` inside the host, which is the single init driver. It stays on the
`boot` group only because three desktop-web auth hooks still call it directly.

### The staleness port

```ts
interface CredentialStalenessPort {
    isStale(route: HttpRoute): boolean;
    recover(route: HttpRoute): Promise<boolean>;
}
```

This is the one question `@chatic/http` cannot answer for itself — the credentials live in
`session/store`, which `http/**` must not import — and cannot skip either. **Without it a signature
rejection is indistinguishable from a network outage**, because the API Gateway 403 that carries it
has no CORS header and reaches the browser as a bare transport failure with no status at all.

The two halves are one answer, which is why they are one interface: detecting a lapsed credential is
only useful if something can act on it, and wiring one without the other leaves a diagnosis with no
treatment.

`SessionCredentialAdapter` in `factory.ts` implements it. Every read goes through the session **on
each call**, never a field captured at construction, so a credential rotation lands on the very next
request without rebuilding the manager.

### Two late-bound registries

Both exist for the same reason: the implementation sits **upstream** of `http/`, so importing it here
would close a ring. Both default to the safe state, and neither lets a failure of its own replace the
caller's.

| Registry              | Default when nothing is registered                                      | Who registers                               |
| --------------------- | ----------------------------------------------------------------------- | ------------------------------------------- |
| `credentialRecovery`  | `false` — no recovery is attempted, and nothing is claimed              | `initAppRuntime`, to the relay renewer      |
| `authFailureReaction` | **silent** — `onAuthFailure` has already logged and is about to rethrow | an app that wants one; `apps/admin-v2` does |

A thrown recovery or reaction is caught and turned into a warning: the caller asked about their
request, not about our notification.

**The reaction is silent by default on purpose**, and this is worth stating because it is a change of
behaviour in a place where "keep the old default" would have been the reflex. The refusal itself is
not a judgement — the credential was re-minted, the request replayed once, and it came back refused,
which is the runtime's one _fact-based_ end-of-session signal as opposed to what a guard can infer.
The **reaction** is a judgement and it differs by surface. A chat app can throw the user at a login
screen; a console cannot, because an admin mid-investigation loses their filters, their pinned rows
and their place, with a blocking `window.alert` on top. The inlined predecessor (alert plus a hard
jump to `/auth/logout`) was in fact never reached — its only caller lost its last production caller
and is not exported — so keeping it as the default would have handed every app a logout behaviour it
has never had, on any 403.

### Gateways and the log sink

Five lazily memoized gateways — `oauthGateway`, `cloudGateway`, `userGateway`,
`subscriptionGateway`, `reportGateway` — all built over `getHttpManager()`. `resetGateways()` exists
for tests and **must be paired with `resetHttpManager()`**: a gateway memoized over a discarded
manager keeps using it.

The network log sink redacts and truncates **key by key**. That is not stylistic: spreading
(`{ ...fields, responseData: … }`) adds an own `responseData: undefined` key on the success path,
where the library deliberately omits it, and a present-but-undefined key reads differently
downstream.

## Usage

Apps do not call into this folder. `data/factories/httpFactory.ts` builds its data sources over the
five gateways, and `session/auth` reaches the transport for one thing —
`buildCredentialsByToken`, which is a local credential reconstruction rather than a request.

The one app-facing surface is the reaction:

```ts
runtime.session.authFailureReaction.register((error, message) => showBanner(message));
```

### What not to do

- **Do not import `session/**`from anywhere under`http/`except`factory.ts`.** That single edge is what keeps the graph acyclic; a second one closes a ring between `session`, `data`and`http`.
- **Do not add a `cloud` route.** A cloud destination is a `baseURL`, and it is relay-signed.
- **Do not build a second lemon transport.** The token storage lives inside the instance.
- **Do not use `isAuthenticated()` as a freshness probe.** It refreshes, into the wrong store.
- **Do not make an unregistered registry do something.** `false` and silence are the safe states, and an app that wants a reaction registers one.
- **Do not restore an alert-and-redirect default.** It would be new behaviour for every app that has never had it.
- **Do not capture the credential at construction.** Read it per call.

## Notes for implementers and tests

- `getHttpManager()` and `resetHttpManager()` are the lazy-singleton pair; `resetGateways()` is the second half of the same teardown.
- `credentialRecoveryWiring.test.ts` (at `src/`, not here) is the contract for the boot wiring: recovery answers `false` before boot, and all three routes reach the relay renewer after it.
- `SessionCredentialAdapter` is not exported. Test it through `getHttpManager()` with a fake freshness, or through `credentialRecovery` directly.
- Redaction lives in [`libs/logger`](../../../logger/README.md) (`redactSensitive`, `truncate`); this file only decides which fields to pass through it.

## Further reading

- [docs/auth/](../auth/README.md) — what `recover()` actually runs, and why relay answers for every route
- [docs/session/](../session/README.md) — `credentialFreshness`, the source of `isStale`
- [docs/data/](../data/README.md) — the data sources built over these gateways
- [`libs/http`](../../../http/README.md) — the executor, retry, bypass and error classification
- [`libs/config`](../../../config/README.md) — where the three endpoints come from
