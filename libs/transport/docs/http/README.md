# http — routes, the relay transport, and two late-bound registries

[`libs/http`](../../../http/README.md) owns the executor: building a request, retrying it,
classifying what came back. This folder owns everything that executor cannot know on its own — which
host a route resolves to, which transport signs it, whether the signing credential has already
lapsed, and what the app should do when the server refuses for good.

It sits in `@chatic/transport`, below everything in app-runtime, which is what lets
`@chatic/auth` and app-runtime's `data/` both depend on it without closing a cycle.

## Layout

```text
http/                              6 source files, 5 tests
├── HttpManager.ts                route endpoints, the staleness port, the log sink, onAuthFailure
├── factory.ts                    the composition root — the staleness port's session reads
├── transport.ts                  the relay request transport, bound to the session's relay token
├── gateways.ts                   six lazily memoized HTTP gateways
├── credentialRecovery.ts         registry: "re-mint this route's credential"
└── authFailureReaction.ts        registry: "the server refused for good"
```

There is **no `http/index.ts`**. The package barrel sells the four modules app-runtime reads —
`transport`, `gateways`, `credentialRecovery`, `authFailureReaction` — and keeps `HttpManager` and
`factory` inside. The two symbols apps do see (`webTransport`, `authFailureReaction`) are re-exported by
app-runtime's `boot` and `session` groups.

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

[`refreshAbsence.test.ts`](../../../app-runtime/src/refreshAbsence.test.ts) walks app-runtime and every
package cut from it, this one included, and fails if any code names a refresh endpoint. It replaced an ESLint `no-restricted-imports` rule that
was keyed to a path string and stopped matching — silently — the moment the symbols moved, letting a
violating file pass lint. The absence test has no path to go stale against.

### The relay transport

`webTransport` has two methods, `buildRequest` and `buildSignedRequest`, forwarding to a
`createRequestTransport` instance from `@chatic/http` that is built on first use — importing this
module does nothing. The instance keeps nothing either. Its signing ports are bound here to the
session: `credential()` and `identityToken()` read the relay token from `relayStore` at the moment a
signed request is sent, and `region()` reads `env.region` from `@chatic/config` the same way. So the
session's relay token is the only copy of the credential, a token the socket renewed is used by the
very next request, and there is nothing to rebuild on boot, clear on logout or keep from drifting.
A signed request made with no relay credential goes out unsigned, and `onUnsigned` logs a warning.

This replaced lemon-web-core, which kept its own copy of the credential (latterly in memory, earlier
in web storage with an expiry clock of its own that disagreed with the credential's), needed a boot
step, and had refresh APIs that updated only its own store. `legacyLemonKeyPrefix()` survives it: it
returns the `@<project>.` prefix lemon-web-core named its keys with, which the clean-up of a bundle
older builds left in web storage still looks for.

`transport.ts` is the second file under `http/` that imports `@chatic/session` — for the relay token
the signer reads, not for staleness.

### The staleness port

```ts
interface CredentialStalenessPort {
    isStale(route: HttpRoute): boolean;
    recover(route: HttpRoute): Promise<boolean>;
}
```

This is the one question `@chatic/http` cannot answer for itself — the credentials live in
`@chatic/session`, which `@chatic/http` cannot import — and cannot skip either. **Without it a signature
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

| Registry              | Default when nothing is registered                                      | Who registers                            |
| --------------------- | ----------------------------------------------------------------------- | ---------------------------------------- |
| `credentialRecovery`  | `false` — no recovery is attempted, and nothing is claimed              | `initAppRuntime`, to the relay renewer   |
| `authFailureReaction` | **silent** — `onAuthFailure` has already logged and is about to rethrow | an app that wants one; `apps/admin` does |

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

Six lazily memoized gateways — `oauthGateway`, `cloudGateway`, `userGateway`,
`subscriptionGateway`, `reportGateway`, `pairingGateway` — all built over `getHttpManager()`. `resetGateways()` exists
for tests and **must be paired with `resetHttpManager()`**: a gateway memoized over a discarded
manager keeps using it.

`reportGateway` is the one built with an option: the archive address, read per call from
`net.archive.endpoint` (`VITE_ARCHIVE_ENDPOINT`). It answers empty — so `@chatic/http` builds the
address from the relay — when nothing is configured and also while `net.relay.backend` is overridden
(the `?_backend=` deep link, the debug panel). A configured archive belongs to the build's relay; a
session moved to another relay has to file its logs on that relay's stage, signed by that relay's
session.

The network log sink redacts and truncates **key by key**. That is not stylistic: spreading
(`{ ...fields, responseData: … }`) adds an own `responseData: undefined` key on the success path,
where the library deliberately omits it, and a present-but-undefined key reads differently
downstream.

On a failure the sink also lifts the status onto the log entry's own `httpStatus`, and a transport
code (`ERR_NETWORK`) onto `errorCode`, so the server can filter on them — inside `data` they arrive
as part of a capped string. `data` still carries both. `errorCode` is left off when it only restates
the status, which is what `@chatic/http` reports whenever a response came back.

Every request the sink sees is also an **`api_request` statistic** — 10 a minute at most, recorded
through `@chatic/logger`'s process recorder, so only when the host has set one and its sampling policy
keeps the run. Its dimensions are the endpoint **template** (`/clouds/:id/release`: the path only, ids
replaced by `:id`, the query dropped — `@chatic/http`'s `endpointTemplateOf` lists what counts as an
id), the method, the status class (`2xx`…`5xx`, `none` without a response), the outcome and the
`backend` — `relay` for a request under the relay endpoint, `cloud` for one sent to a cloud's own
backend (any other host: those are the requests that carry the host their token or invite names), and
absent for the OAuth and in-app-purchase hosts. The host itself is never carried. Its
metrics are the round trip and, when the server sent `content-length`, the response size on the wire
(compressed when the response was; absent on a chunked response). The size is kept out of the log
line. Samples are per attempt — a request replayed after its credential was recovered records both
attempts — and the cap is a fixed one-minute window that keeps its first ten, so bursts at the start
of a run are over-represented. The log batch upload bypasses this sink, so measuring never feeds itself.

## Usage

Apps do not call into this package. app-runtime's `data/factories/httpFactory.ts` builds its data
sources over the gateways, and `@chatic/auth`'s HTTP-side use of this folder is `legacyLemonKeyPrefix()`, for the clean-up of
lemon-web-core's old keys.

The one app-facing surface is the reaction:

```ts
runtime.session.authFailureReaction.register((error, message) => showBanner(message));
```

### What not to do

- **Do not import `@chatic/session` from anywhere under `http/` except `factory.ts` and `transport.ts`.** The staleness port and the signer's credential are the two reasons this half reads the session, and keeping them to those files keeps the rest of `http/` a leaf.
- **Do not add a `cloud` route.** A cloud destination is a `baseURL`, and it is relay-signed.
- **Do not give the transport a credential store or a refresh.** It reads the session's relay token per request; a second copy is what the lemon-web-core era had to keep in step.
- **Do not make an unregistered registry do something.** `false` and silence are the safe states, and an app that wants a reaction registers one.
- **Do not restore an alert-and-redirect default.** It would be new behaviour for every app that has never had it.
- **Do not capture the credential at construction.** Read it per call.

## Notes for implementers and tests

- `getHttpManager()` and `resetHttpManager()` are the lazy-singleton pair; `resetGateways()` is the second half of the same teardown.
- `credentialRecoveryWiring.test.ts` (in app-runtime's `src/`, where the boot wiring lives) is the contract for the boot wiring: recovery answers `false` before boot, and all three routes reach the relay renewer after it.
- `SessionCredentialAdapter` is not exported. Test it through `getHttpManager()` with a fake freshness, or through `credentialRecovery` directly.
- Redaction lives in [`libs/logger`](../../../logger/README.md) (`redactSensitive`, `truncate`); this file only decides which fields to pass through it.

## Further reading

- [auth docs/socket/](../../../auth/docs/socket/README.md) — what `recover()` actually runs, and why relay answers for every route
- [`libs/session`](../../../session/README.md) — `credentialFreshness`, the source of `isStale`
- [docs/data/](../../../runtime-core/docs/data/README.md) — the data sources built over these gateways
- [`libs/http`](../../../http/README.md) — the executor, retry, bypass and error classification
- [`libs/config`](../../../config/README.md) — where the three endpoints come from
