# ADR-0076: Auth state has one verdict — typed session signals · credential renewer · ADR-0070 §0 completed

> Status: **Live** · Written: 2026-09-07 · Implementation complete: 2026-09-07 (§Execution log)
> Scope: `libs/app-runtime/**` + 4 apps (`apps/web` · `apps/admin-v2` · `apps/testbed` · `apps/desktop-web`)
> Related: [ADR-0070](./0070-app-runtime-session-hub.md) (session hub — this document applies its §0
> principle to the remainder and updates the wording of Decisions 2 and 7) ·
> [ADR-0036](./0036-data-surface-unification-app-runtime-cleanup.md) ·
> 2026-08 session management audit (lived in the root docs tree, which has since been removed) ·
> 2026-09 dead code sweep (lived in the root docs tree, which has since been removed)

> **Terminology fixed:** same as ADR-0070. **Auth SDK** means `ClientSocketAuth` (`AuthController`)
> from `@lemoncloud/chatic-sockets-lib`.
>
> **Names come from repo convention, and the strength of precedent differs by name.** The symbols
> below follow the forms actually measured in the current tree (55 pairs of `I*` interface +
> class · `deriveConnectivity`/`ConnectivityStatus` · 265 `*Adapter` · 234 `*Snapshot` · `*Policy` ·
> `useRuntime*`), except for the **one word that does not exist in the repo at all**
> (`ICredentialRenewer` — derived from the existing verb `renew*`), which is marked as such. The
> measured occurrence count and grounds for each name are owned, as a table, by
> `libs/app-runtime/docs/architecture.md` §Naming conventions.

## Context

ADR-0070 sorted out the session's **ownership** — one store, one refresh owner, one scope owner.
That goal was met and there is nothing to roll back. This document deals with the next layer:
**ownership is singular, but there are still several ways to read the state.**

### 1. There is no single place that answers "what is the relay auth state right now"

Answering one question requires reading seven different values from seven different modules.

| #   | Source                                                                            | Meaning                                   |
| --- | --------------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | `identity.isAuthenticated` (`libs/app-runtime/src/session/store/contextStore.ts`) | session **exists** (not validity)         |
| 2   | `relayStore.getRelayToken()`                                                      | token present or not                      |
| 3   | `credentialFreshness.timeToExpiry('relay')`                                       | remaining lifetime of the AWS credential  |
| 4   | `client.auth.state` (Auth SDK)                                                    | controller state (terminal `expired`)     |
| 5   | `manager.isKindVerified(kind)`                                                    | handshake complete **on this connection** |
| 6   | `isStoredSessionExpired()`                                                        | the lemon store's separate clock          |
| 7   | `hasStoredRelaySession()`                                                         | lemon store existence                     |

The rule for combining these seven is rewritten **in two places** —
[`useSessionStalenessGuard`](../../libs/app-runtime/src/session/hooks/app/useSessionStalenessGuard.ts) ·
[`requestRelaySessionRefresh`](../../libs/app-runtime/src/socket/auth/requestRelaySessionRefresh.ts) ·
[`recoverUnverifiedSockets`](../../libs/app-runtime/src/socket/auth/recoverUnverifiedSockets.ts). Both
ask the same question — "can this slot's socket auth be used right now" — and each justifies itself
with 20-40 lines of comments that never reference each other. Neither the debug overlay nor the logs
can reuse this verdict, so reproducing an incident means a human has to line up all seven by hand.

> **Originally counted as four places, and phase 3's execution corrected that to two.** The other
> two were not copies of the same verdict —
>
> - [`useConnectivity`](../../libs/app-runtime/src/connection/hooks/useConnectivity.ts) is a **display
>   verdict** (the three grounds under §Decision 1).
> - [`useSessionStalenessGuard`](../../libs/app-runtime/src/session/hooks/app/useSessionStalenessGuard.ts)
>   uses two clocks under **different policies**: it always refreshes the stored session's
>   expiration and counts failures toward the teardown streak (admin-v2 logs out after three
>   consecutive failures), while the credential margin only fires with `forceRefresh` opt-in +
>   cooldown, and does not count failures ("a still-valid credential says nothing about session
>   health" — the guard's own comment). `AuthStatus` folds both into a single `stale` and puts
>   `handshaking` ahead of `stale`, so switching to state-based logic would make the guard return
>   early and reset the streak while the socket is unverified — zombie cleanup would disappear in
>   exactly the scenario the guard exists for: a dead socket plus an expired session. The only thing
>   worth sharing is the one line that compares the credential margin, and that already uses a
>   single `msUntilExpiration` (batch A3).
>
> So the reduction is **2 → 1**. The goal is not to force a single verdict, it is to stop writing
> _the same question_ twice.

`deriveConnectivity` is already the right shape — it takes its input (`ConnectivitySignals`) as a
struct and is a pure truth table, tested without a socket manager. **That pattern is applied to
connection state only, not to auth state.**

### 2. Session notifications are uninformative broadcasts, so one use case fans out 8 times

`notifySessionStateChanged()` has no payload and has **24** call sites (15 in stores · 5 in
contextStore · 4 in use cases). Subscribers only hear "something changed" and re-derive everything.

The notifications a single cloud switch (at the time, `switchCloudSession` in `services.ts` — now
[`cloudSession.ts`](../../libs/app-runtime/src/session/auth/cloudSession.ts)) fires on its success
path:

```
saveSelectedCloudId(1) → clearSelectedSite(2) → saveDelegationToken(3) → saveCloudToken(4)
→ saveSelectedCloudId(5) → clearPlaceOrder(6) → rebuildSessionIdentity(7) → setSelectedCloudId(8)
```

Each notification drops `cachedGlobalSessionContext`, re-renders every `useGlobalSession` subscriber,
and reassembles `useRuntimeBinding`. So **7 inconsistent intermediate states are exposed to
observers as-is.** (Numbers 5 and 8 are the same function — `setSelectedCloudId` is literally
`cloudStore.saveSelectedCloudId`. Pure duplication.)

`rebuildSessionIdentity` knows about this problem and has hand-installed an
[equality gate](../../libs/app-runtime/src/session/store/contextStore.ts). But the other four entry
points that use the same state (`setSessionAuthenticated` · `clearRelaySession` ·
`setSessionIdentityState` · `markSessionInitialized`) notify unconditionally. One state, five entry
points, two notification policies. And `sessionContextStore.setIdentityState` **does not notify at
all**, so callers have to remember on their own — a convention, not a contract.

### 3. The relay/cloud recovery asymmetry branches independently in 8 places

**One fact** — "relay has nothing but refresh (there is no parent token), while cloud is
**reissued** from the relay identity" — branches in eight places, each re-explaining the same
grounds in 20-30 lines of comments: `sessionDelegate.onAuthExpired` · `configureCredentialRecovery` ·
`credentialFreshness` · `useSessionStalenessGuard` · `useCloudCredentialGuard` ·
`SessionCredentialAdapter` · `requestRelaySessionRefresh` · `renewCloudSession`.

The two guards **differ only in policy, not in scheduling** — `enabled`, the margin, the
`visibilitychange` edge, the in-flight guard, and the retry sleep after failure are all duplicated
on both sides.

The decision to keep the two guards separate after ADR-0070 is on record
(["adding a `kind` option here would put two unrelated recovery strategies behind one
switch"](../../libs/app-runtime/src/session/hooks/app/useSessionStalenessGuard.ts)), and that
judgment still holds. The problem is that it **expresses the policy split only in comments**.
`libs/http` has already solved the same problem with types — `ICredentialRecoverer` has two
implementations, `NoCredentialRecovery` and `PortCredentialRecoverer`, attached to it. There is no
equivalent layer on the app-runtime side.

### 4. Seven hand-built concurrency guards, all shaped differently

| Location                     | Shape                                                        |
| ---------------------------- | ------------------------------------------------------------ |
| `RelayRefreshCoalescer`      | class · `inFlight` + 3-second result memo + a `reset()` seam |
| `renewCloudSession`          | module-level `let inFlight`                                  |
| `recoverUnverifiedSockets`   | module-level `let inFlight`                                  |
| `useSessionStalenessGuard`   | `useRef inFlight` + `lastForcedAt` 60-second cooldown        |
| `bootstrapSocketConnection`  | per-instance `resumeHoldUntil` + exponential backoff         |
| `useRelaySessionKeepAlive`   | `runningRef`                                                 |
| `useDeviceTokenRegistration` | `pendingRef` + 60-second throttle                            |

Answering "can this path fire twice?" means reading all seven. `RelayRefreshCoalescer` is already
the class that's needed, and the other six are inferior copies of it.

### 5. ADR-0070 §0 was never applied to the session hub

ADR-0070 §0 stated: _"a boundary-crossing surface in the old web-core style — a bundle of exported
functions — is reorganized into an interface plus a class as it is migrated."_ `data` ·
`@chatic/http` · `@chatic/db` · scope all followed that (the result is 55 `I*` interface pairs plus
matching classes). `session/auth/services.ts` (deleted by this decision) was migrated as-is from
web-core, as **539 lines · 15 loosely exported functions**. This file was the one place in the
session hub that never honored §0, and at the same time the most frequently read one.

The three sibling stores also went only halfway — they have interfaces, but named `RelayCore` /
`CloudCore` / `IdentityCore`, **still carrying the web-core-era `session/core` folder name**
(outside the repo's `I*` convention), implemented as object literals so there is no constructor
injection (storage is a module global), and every read is a `JSON.parse` (a single call to
`buildRelayContext()` parses the relay token three times).

### 6. The boundary lives only in documentation — 31 of 111 public surfaces go unused by any app

[public-surface.md](../../libs/app-runtime/README.md) admits that store writers are in
the barrel, then writes _"this is not an invitation for apps to manipulate the session directly."_
But `public-surface.test.ts` **locks those symbols in as a public contract**. So the discipline is
prose, and the test enforces the opposite direction.

Measured: of 111 exported public values, **31 have zero references** in non-test app code, and
those 31 include all the dangerous ones —
`commitServerRefreshedToken` · `signServerAuth` · `getServerAuthRegistration` (internal to the Auth
SDK bridge) · `rebuildSessionIdentity` · `clearRelaySession` · `setSessionIdentityState` ·
`markSessionInitialized` · `notifySessionStateChanged` · `sessionContextStore` ·
`setSelectedCloudId` · `setSelectedSiteId` · `applySelectedSite` · `persistDeviceId` …

> **Measurement correction (during phase 2 execution): 31 → 32.** `setSessionAuthenticated` was
> counted as app-referenced, but that "reference" was nothing but a single **comment line** in
> `apps/admin-v2`'s OAuthResponsePage. Identifier-frequency-based detection can't screen out
> comments, and the same trap hid `useRegisterDeviceToken` too (phase 0) — a limitation the 2026-09
> sweep admitted on its own. What was actually removed is 32. **The measured trajectory of public
> value exports is `111 → 78 → 77 → 67`** — 111 on develop, phase 2 removed 32 to reach 78 (the same
> phase newly added one, `logoutSession`), phase 6 removed `useRuntimeSocketSlots` once it had zero
> consumers to reach 77, and phase 7 removed 9 with zero app imports plus 3 `ServiceUnavailable`
> symbols to reach **67**. The first draft's "110 → 78" here under-counted the baseline by one
> (it is 111) and presented phase 2's intermediate value as the final one.

### 7. A defect ADR-0070 declared fixed remains **inside** the package

ADR-0070 §Context tabled the defect where two barrels produced the same name, and concluded:
_"when two barrels emit the same name, the call site has no way to know which one is real — making
the entry point singular is itself the fix for this defect."_ `web-core` is gone. But **the same
collision is still there, inside the merged package.**

| Name                                   | Weak version (store only)                         | Strong version (socket notification + store)                                                        | What the root barrel exports |
| -------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------- |
| `logoutCloudSession`                   | `session/auth/services.ts` (deleted)              | [`socket/auth/logoutCloudSession.ts`](../../libs/app-runtime/src/socket/auth/logoutCloudSession.ts) | **weak version**             |
| `logoutRelaySession` / `logoutSession` | `session/auth/services.ts` (`logoutRelaySession`) | `socket/auth/logoutSession.ts` (`logoutSession`)                                                    | **weak version**             |

The hooks (`useLogoutCloudSession` · `useSessionLogout`) use the strong version, so the screen path
is fine. But with public-surface.md declaring the strong version "internal", **the root barrel
publicly exports the weak version under the same name**, and
[`apps/admin-v2`'s `useRelaySessionGuard`](../../apps/admin-v2/src/app/hooks/useRelaySessionGuard.ts)
actually calls the weak version on teardown — that logout skips both slots' `auth.logout`.

## Decision

### 0. Apply ADR-0070 §0 to the rest of the session hub — names follow existing convention

Not a new decision, but the **enforcement of what was left unapplied**. The contract is `I*`
interfaces, the implementation is a class plus constructor injection, and only interfaces and domain
types cross the boundary. The target is `session/auth/services.ts` and the three sibling stores
pointed to by §Context 5.

**No new names are invented.** Only suffixes and shapes already present in the repo are used —
`I*` + class (55 pairs), including the ones that go all the way to a camelCase module singleton
(**4 cases**: `credentialRecovery` · `credentialFreshness` · `staleCredentialMarker` · `webClient`),
`derive*` + `*Status` + `*Signals` (`deriveConnectivity`/`ConnectivityStatus`/`ConnectivitySignals`),
`-er` agent nouns (`ICredentialRecoverer` · `IAuthSigner` · `IFailureAttributor`), `*Policy` ·
`*Snapshot` · `*Adapter` · `useRuntime*` · `use*Guard`. Suffixes with zero occurrences in the repo
(`*Impl` · `*Service` · `*Strategy` · `*Bus` · `*Verdict`) are not used. The mapping table lives in
`libs/app-runtime/docs/architecture.md` §Naming conventions.

### 1. `deriveAuthStatus` alone owns the auth state verdict

It reads the seven sources and produces **one named state**. The verdict is a pure function (a truth
table in the same shape as `deriveConnectivity`), and gathering the sources is left to the function
next to it — **no new noun (class or singleton) is created.** It follows the "function + optional
`*Deps` + lazy default" shape already used in the same folder by
`requestRelaySessionRefresh(deps)` and `recoverUnverifiedSockets(deps)`, so no lazy singleton and no
`reset*` seam are needed.

```ts
// socket/auth/authStatus.ts — pure verdict (isomorphic to deriveConnectivity)
export type AuthStatus =
    | 'absent' // no token — pre-login
    | 'handshaking' // token present, this connection's device.save → auth.update in progress
    | 'verified' // isKindVerified
    | 'stale' // verified, credential at or below margin → due for renewal
    | 'wedged' // bound but unverified (zombie) → wake-kick candidate
    | 'expired'; // Auth SDK terminal → onTerminalExpiry candidate

export interface AuthSignals {
    readonly hasToken: boolean;
    readonly transport: ClientSocketState;
    readonly controller: AuthControllerState | null;
    readonly verifiedOnThisConnection: boolean;
    readonly credentialMs: number | null;
    readonly marginMs: number;
}

export const deriveAuthStatus = (signals: AuthSignals): AuthStatus => {
    /* truth table */
};

export interface SocketAuthSnapshot extends AuthSignals {
    readonly kind: SocketKind;
    readonly status: AuthStatus;
}
```

```ts
// socket/auth/authStatus.ts — source gathering (same file, right below the pure function)
export interface AuthSignalDeps {
    manager?: Pick<ISocketManager, 'isKindVerified' | 'getClient'>;
    renewer?: ICredentialRenewer;
}

/** Gathers an `AuthSignals` from the store, socket, and SDK. Resolves runtime defaults lazily when nothing is injected. */
export const readAuthSignals = (kind: SocketKind, deps?: AuthSignalDeps): AuthSignals => {
    /* ... */
};

/** What call sites use. Two lines: `readAuthSignals` → `deriveAuthStatus`. */
export const getAuthStatus = (kind: SocketKind, deps?: AuthSignalDeps): AuthStatus =>
    deriveAuthStatus(readAuthSignals(kind, deps));
```

Taking `*Deps` as optional and resolving defaults lazily is the shape already used in the same
folder by
[`requestRelaySessionRefresh`](../../libs/app-runtime/src/socket/auth/requestRelaySessionRefresh.ts) ·
[`recoverUnverifiedSockets`](../../libs/app-runtime/src/socket/auth/recoverUnverifiedSockets.ts).
This projection also needs to know both the store and the `SocketManager`, so it cannot be assembled
at module load time — but deferring that to the function argument means no lazy singleton
(`get*`/`reset*`) is needed. Tests pass `deps` directly.

**Rule:** `deriveAuthStatus` is the only place that recomputes `AuthStatus`. Guards, wake recovery,
`requestRelaySessionRefresh`'s precondition, connection-state hooks, the debug overlay, and logs all
**only read** `status` (or the `AuthSignals` fields that produced it). Writing a new verdict branch
in another file is a regression.

**`deriveConnectivity` keeps its own input unchanged.** It answers _what to tell the user_, and this
answers _what the runtime should do_ — that sentence was right from the start, and the line that
followed it ("except that it takes its input from `SocketAuthSnapshot`") contradicted it, so it was
withdrawn during phase 3 execution. Three grounds:

- **Every extra input `AuthStatus` would add collapses to the same value in the banner.**
  `hasToken` (if logged out, the slot isn't bound, so it's already `idle`→`online`) ·
  `controller: 'expired'` (already `isVerified=false`→`reconnecting`) ·
  `credentialMs`/`storedSessionExpired` (**not something to tell the user** — the socket is
  connected and usable). `stale` has to map to `online`, so changing the input doesn't change the
  output.
- **`AuthStatus` isn't a subscribable value.** The banner currently reacts to a single
  `manager.subscribe` subscription. Using the snapshot would mean composing a subscription set
  (socket state · `subscribeKindVerified` · session signals), and missing one **quietly stops the
  banner from updating**.
- **The axes differ.** The banner asks about the ACTIVE slot, while the snapshot is per-kind.
  Merging them would require making `SocketManager.getActiveKind()` public, right after Decision 6
  cut the surface from 111 to 67 — the opposite direction.

So `deriveConnectivity` is **not a copy** of the auth verdict — it is a display verdict, and
Principle 6 applies only to the auth verdict. Merging them becomes right the moment the banner has
an actual **UI requirement** to distinguish `expired` with different copy. That's when the cost of
wiring the extra subscriptions becomes worth paying.

### 2. Session notifications are typed signals — and one use case equals one fan-out

Payload-less global broadcasts are replaced with typed signals, with a **batch boundary** provided.
This reuses the vocabulary already used by
[`session/store/signal.ts`](../../libs/app-runtime/src/session/store/signal.ts) ("session signal"),
so no new concept term is introduced.

```ts
// session/store/signal.ts
export type SessionSignalKind = 'relay:token' | 'cloud:token' | 'selection' | 'identity';

export interface ISessionSignal {
    emit(kind: SessionSignalKind): void;
    subscribe(kinds: readonly SessionSignalKind[], listener: () => void): () => void;
    /** Nestable. Flushes the accumulated signals once, when depth returns to 0. */
    batch<T>(fn: () => T): T;
}
class SessionSignal implements ISessionSignal {}
export const sessionSignal: ISessionSignal = new SessionSignal();
```

- `switchCloudSession` · `reissueCommittedCloudTokens` · cloud/relay teardown are wrapped in
  `sessionSignal.batch` → switch notifications go from 8 to **1**. The intermediate states become
  unobservable.
- `useRuntimeSocketSlots` only subscribes to `['relay:token','cloud:token','selection']` → it does
  not reassemble on an identity-only change. The hand-built equality gate is removed because the
  structure now takes its place.
- The existing `subscribeSessionSignal` remains as a thin wrapper subscribing to every kind —
  `useGlobalSession`'s call sites don't change.
- **The optimistic-transition three views (`selected`/`bound`/`committed` — renamed in §Decision 8)
  are untouched.** ADR-0070 Decision 7 stays valid — what's being merged is not the values but the
  _timing of the notification_. Reading this as value unification would bring back cross-cloud cache
  contamination.
- The notification policy's consistency is fixed as a rule: **write methods emit their own signal,
  no exceptions.** The current inconsistency (`savePlaceOrder` notifies nothing, `clearPlaceOrder`
  notifies, `setIdentityState` notifies nothing) is treated as a bug. The only exception is a pure
  cache write (`setCachedCloudTokens`), and that exception is visible in its name.

### 3. Credential renewal is 2 implementations of `ICredentialRenewer`, and there is one scheduler

`libs/http` puts the same shape (`ICredentialRecoverer` + `NoCredentialRecovery` ·
`PortCredentialRecoverer`) on the same problem — this places an equivalent on the app-runtime side.

> **`Renewer` is a new word, not in the repo** (0 measured occurrences — `Recoverer`'s 9 are all
> `libs/http`). Only the shape is derived: the `-er` agent noun is the convention already used by
> `ICredentialRecoverer` · `IAuthSigner` · `IFailureAttributor`, and `renew` is already this
> package's verb (`renewCloudSession`). `Recoverer` isn't reused directly because it would be
> confused with `libs/http`'s contract of the same name — that one is request-retry recovery, this
> one is token renewal.

```ts
// session/auth/renewers/credentialRenewer.ts
export interface ICredentialRenewer {
    readonly owner: CredentialOwner; // 'relay' | 'cloud' (reuses the existing type)
    timeToExpiry(now?: number): number | null; // delegates to credentialFreshness
    /** relay: Auth SDK auth.refresh · cloud: delegate-cloud + exchange-token + socket re-registration */
    renew(): Promise<boolean>;
    /** relay: log out · cloud: leave only the cloud */
    onTerminalExpiry(): Promise<void>;
}
```

Two implementations live here: `RelayCredentialRenewer` and `CloudCredentialRenewer`.

> **Follow-up (2026-09-08): relay's `onTerminalExpiry` isn't a one-line "log out" — it goes through
> a confirmation window.** The policy this decision carried over (terminal `expired` → automatic
> logout) predates ADR-0076 — it already lived inside the delegate — and moving it did not
> re-examine that premise. The premise was "`expired` means a stuck signature", but in fact
> **three consecutive failures on a dying link** (`maxFailures`) produce the same value — the
> bootstrap gate's own comment this document quotes already said as much ("request timeout on a
> zombie socket right after waking"). So the only automatic path capable of ending a session at
> runtime logged the user out precisely when every other recovery path is offline and stepping
> back.
>
> Now, if `navigator.onLine === false` it holds off (a trustworthy negative — the same asymmetry
> §Decision 1 describes for `deriveConnectivity`), and if online it waits through a 30-second
> confirmation window, then **re-reads** the state and logs out only if it is still `expired` at
> that point. If the first resume on reconnect or a foreground reseed moves the state during the
> window, the session survives. The window is a verdict deferral, not a retry loop (no scheduling,
> no kick), and repeated reports are folded into one verdict by Decision 4's `Coalescer`. The
> contract is locked by
> [`renewers.test.ts`](../../libs/app-runtime/src/socket/auth/renewers.test.ts).

> **Correction (after implementation).** The draft said `credentialFreshness` would be **absorbed**
> into the renewer. That did not happen — the singleton stays, and both renewers' `timeToExpiry`
> delegate to it. The reason is that the renewer isn't its only consumer:
> `http/factory.ts` injects it into `SessionCredentialAdapter`, and `socket/auth/authStatus.ts`
> takes it as `AuthSignalDeps.freshness`. Moving it inside the renewer would make the HTTP lane
> see `socket/auth`, reversing the argument §Decision 3 made for placing the renewer in
> `socket/auth`. `credentialFreshness` owns the computation; the renewer owns the policy (what to
> do about it).

> **The `useCredentialGuard` merge is withdrawn (phase 5 execution).** The plan said "only merge
> the common scheduling part", but there is almost no common part — the two guards' **trigger
> models differ**. relay is polling (`setInterval` 30 seconds + `visibilitychange` + a relay
> verification rising edge), while cloud is a **self-arming deadline** derived from the credential's
> `Expiration` (`setTimeout` + upper/lower clamp + retry sleep). What's left in common is just the
> `enabled` guard and `visibilitychange`, and in-flight sharing is already unified by Decision 4's
> `Coalescer`. Merging them would produce a `mode: 'interval' | 'deadline'` switch — exactly the
> shape the post-ADR-0070 guard comment already rejected. The two hooks keep their own triggers,
> and **what they share is the renewer.**
> `sessionDelegate.onAuthExpired` becomes a single line, `renewers[kind].onTerminalExpiry()`, and
> `configureCredentialRecovery` registers the relay renewer's `renew`.

> **This does not conflict with the post-ADR-0070 judgment — the difference is stated explicitly.**
> What was rejected was a _`kind` switch inside one function body_ (two policies hiding behind one
> switch). This decision goes the opposite direction: it **splits the policies into two classes and
> fixes them with types**, and shares only the duplicated timer/visibility/in-flight code between
> them. Policy separation is promoted from a comment to a type, so it gets stronger. Observable
> behavior (margin · cooldown · retry sleep · whether a failure counts toward the teardown streak)
> is **unchanged**, and a truth-table test locks that invariance.

Existing hook names and signatures are unchanged — app call sites (`apps/web` · `admin-v2` ·
`desktop-web`) don't change.

### 4. Concurrency guards are two things: `Coalescer` and `Throttle`

The seven hand-built ones are **not one kind, but two** — a correction phase 5 execution confirmed.

- **Coalescing**: concurrent requesters share one in-flight attempt, and all get the same answer.
  `RelayRefreshCoalescer` (3-second result memo) · `renewCloudSession` · `recoverUnverifiedSockets` ·
  keepAlive's `runningRef` · staleness's `inFlight`. All return a Promise.
- **Throttling**: if the last fire was too recent, it **doesn't start at all**. What the caller wants
  is not a value but permission, and a refusal means "skip this trigger". staleness's
  `forceRefresh` 60 seconds · push re-registration 60 seconds · the terminal `expired` resume's
  30-second→5-minute exponential backoff. The last of these **isn't even a Promise** — it's a
  synchronous gate inside a socket message handler.

Folding these into one would require attaching a `skipped` sentinel to every Promise-returning call
site, and that non-async gate still couldn't be represented. That would be the same mistake as
folding unrelated recovery strategies behind one `kind` switch, so it is split into **two
primitives**: `Coalescer<T>` + `Throttle`.

```ts
// utils/coalescer.ts
export class Coalescer<T> {
    constructor(opts?: { memoMs?: number; cooldownMs?: number; backoff?: 'none' | 'exponential' });
    run(attempt: () => Promise<T>): Promise<T>;
    reset(): void; // test seam — so one case doesn't inherit the previous case's answer
}
```

`bootstrapSocketConnection`'s exponential backoff (the terminal `expired` resume throttle) is
expressed as `backoff: 'exponential'`. Its values (initial 30 seconds · 5-minute cap · reset on
`authenticated`) were set by the 2026-08 audit §5-1, so **the numbers do not change.** Each domain's
`*Attempt` class (`RelayRefreshAttempt`) stays as it is.

### 5. Reorganize `session/auth/services.ts` into classes

The suffix isn't the repo's zero-occurrence `*Service`, but **the bare concept noun**, as
[`ActiveScope`](../../libs/app-runtime/src/session/scope/ActiveScope.ts) does. `*Manager` isn't used
either — ADR-0070 fixed that name to mean "there are four engines", and adding two more would blur
that boundary.

> There is no class or interface ending in `*Session` in the repo yet. The grounds are the single
> **shape** of `ActiveScope` (a concept noun with no suffix), while the word itself is already
> common as a noun phrase — `CloudSessionSnapshot` · `switchCloudSession` ·
> `initializeRelaySession` · `logoutRelaySession`. Promoting that noun phrase to a class is not new
> vocabulary.

| Interface / Class                                     | File                                 | Owns                                                                            |
| ----------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| `IRelaySession` / `RelaySession`                      | `session/auth/relaySession.ts`       | `initialize` · `loginAs*` · `applyToken` · `logout` · `clearSessionAndRedirect` |
| `ICloudSession` / `CloudSession`                      | `session/auth/cloudSession.ts`       | `switchTo` · `leave` · `applySelectedSite` · `reissueCommitted`                 |
| `SessionAuthAdapter implements SocketSessionDelegate` | `session/auth/sessionAuthAdapter.ts` | Auth SDK bridge — seed · sign · writeback · expiry                              |
| pure functions                                        | `session/auth/utils/tokenMerge.ts`   | `mergeRefreshedRelayToken` · `mergeRefreshedCloudToken`                         |

The grounds for `SessionAuthAdapter`'s suffix are
[`SessionCredentialAdapter implements CredentialStalenessPort`](../../libs/app-runtime/src/http/factory.ts)
— the same package already uses this name for a class that fits session state to a port.
`*Impl` has 0 occurrences in the repo.

45 of `commitServerRefreshedToken`'s 73 lines are grounds comments for three **field-preservation
invariants** (`identityToken` · `identityPoolId` · `credential`). Splitting this out as
`mergeRefreshedRelayToken` attaches one test per invariant — right now only a comment holds each
invariant in place. It's a function, not a class, because it follows the repo's pure-helper
convention (`calcSignature` · `deriveConnectivity` · `msUntilExpiration`).

The three sibling stores are cleaned up under the same rule — only the interface names move to
convention (`RelayCore` → `IRelayStore`), a class is added, and **the singleton names
(`relayStore` · `cloudStore` · `identityStore`) and file names stay as they are.** Call sites don't
change.

### 6. Dropping the public surface out of `index.ts` is enough

- Remove the 31 unused-by-apps symbols from the root barrel (0 app code changes).
- **No second barrel (`internal.ts`) and no subpath export.** No lib in the repo exposes any subpath
  other than `.` and `./package.json`, so that would be a new pattern, and it's unnecessary — internal
  consumers already have a convention of importing concrete module paths
  ([`useSocketSessionDelegate.ts`](../../libs/app-runtime/src/connection/hooks/useSocketSessionDelegate.ts)
  bypassing the barrel to reach `../socket/auth/sessionDelegate` directly is the precedent). The
  definition of "internal" is simply **not in `index.ts`**, and `public-surface.test.ts`'s single
  `EXPECTED` list locks that in place.
- The surface scan (public symbols × app references) is promoted to a test so unused exports don't
  pile back up.

`patchRelaySessionUser` / `getRelaySessionUser` are kept on the public surface as an exception — they
are the read/write pair for the account profile, a
[question the local cache can't answer](../../libs/app-runtime/src/session/store/contextStore.ts),
documented as such, and `apps/web` actually uses them (ADR-0062).

### 7. Remove the name collision — what is published is the strong version

The weak version in `session/auth` loses its global name once it becomes a class method —
`relaySession.clearSessionAndRedirect()` · `cloudSession.clearStores()`. The verb follows the
repo's `clear*` family (`clearSession` · `clearToken` · `clearIdentity` · `clearSelectedSite`). The
root barrel's public `logoutSession` · `logoutCloudSession` are assigned only to the `socket/auth`
version that includes the socket notification.

`apps/admin-v2`'s `useRelaySessionGuard` teardown is moved to the strong version — **the one place
in this ADR where app code changes.**

### 8. Rename the first of the three scope views to `selected` (a vocabulary update to ADR-0070 Decision 7)

ADR-0070 Decision 7 named the three views of an optimistic transition `intent` · `bound` ·
`committed`. That **structure remains valid and this ADR keeps it** (§Decision 2) — what changes is
only the name of the first view.

| Now                              | New name                           |
| -------------------------------- | ---------------------------------- |
| `ActiveScope.get intent`         | `get selected`                     |
| `ActiveScope` ctor `readIntent`  | `readSelected`                     |
| `deriveIntent()`                 | `deriveSelectedContext()`          |
| `session/scope/intent.ts`        | `session/scope/selectedContext.ts` |
| `DataManager`'s `intentProvider` | `selectedContextProvider`          |

Two grounds:

- **The repo already calls this concept `selected`** — `getSelectedCloudId` ·
  `getSelectedSiteId` · `applySelectedSite` · `clearSelectedSite` · `selectedCloudId` ·
  `selectedSiteId` · `useSessionSelection` · the `CLOUD_SELECTED_*` keys. `'selection'` is already
  in the `SessionSignalKind` that §Decision 2 introduces. `intent`, by contrast, appears with this
  scope meaning in only **3 files**, and every other occurrence of `intent` in the repo is an
  **Android `Intent`** (deep links — `apps/mobile` · `apps/landing` · `docs/DEEP-LINKING*`), which
  makes search results collide.
- **The three views' parts of speech line up.** `selected` / `bound` / `committed` are all past
  participles answering "what has happened to this value". `intent` alone was a noun, so reading the
  three in one line put the axis out of alignment.

Why `deriveSelectedContext` and not `deriveSelectedScope`: the scope is `ActiveScope` itself and
these three are its **views**, so using `Scope` would collide with the owner's name. Since the value
returned is a `DataContext`, `*Context` (14 occurrences in the repo) is the right suffix.

The blast radius is small — 4 code files + 1 test, and **zero apps** touch it, and `@chatic/data`
doesn't know this name either. There's no behavior change, so it goes into phase 0 (batch A).

## Target structure

The architecture document for `libs/app-runtime` was **rewritten** to reflect this decision — the
detailed structure · diagrams · scenarios · naming conventions · verification method has a single
SSoT, `libs/app-runtime/docs/architecture.md`. The new document was written as `architecture-v2.md`,
and once implementation was complete it absorbed the old document's reference section and inherited
its file name (§Execution log correction 7).

## Phasing · Execution log

The basis for splitting phases was **cost of reversal**. Phases 0-2 don't touch any app and can be
reverted at any time; from phase 3 on, the verdict and notification paths change. All phases were
executed, and the commits sit on branch `claude/app-runtime-auth-architecture-31b5a3` (on top of
`76a601410`).

| Phase | Content                                                                     | Commit                                    | App impact       |
| ----- | --------------------------------------------------------------------------- | ----------------------------------------- | ---------------- |
| 0     | dead code · duplicate writes · stale comments · `intent`→`selected`         | `9e8a1b107`                               | none             |
| 1     | Decision 7 — remove the name collision                                      | `df897adec`                               | admin-v2, 1 spot |
| 2     | Decision 6 — barrel cleanup                                                 | `e38be8c98` · review response `ccbb35fb2` | none             |
| 3     | Decision 1 — introduce `deriveAuthStatus` + migrate 2 copies of the verdict | `cbbe94c7e` · `81e44162e`                 | none             |
| 4     | Decision 2 — `ISessionSignal` + `batch`                                     | `07fc8e57a` · `3d1f161f1`                 | none             |
| 5     | Decisions 3·4 — 2 renewers + `Coalescer`/`Throttle`                         | `62f08eaf8` · `aa3ba989d` · `b06c6951f`   | none             |
| 6     | Decisions 0·5 — turn stores/session into classes, migrate slot derivation   | see the 5 below                           | 4 apps           |
| 7     | remove zero-consumer surface · duplicate names, retire `ServiceUnavailable` | `782135f6b`                               | none             |
| 8     | **full unused-code sweep** — see §Phase 8 below                             | (this commit)                             | none             |

Inside phase 6 (the largest phase, so committed piece by piece):

| Piece                                                                | Commit      |
| -------------------------------------------------------------------- | ----------- |
| Turn the 3 sibling stores into classes + split `ISocketManager` in 4 | `bbc5cd6e0` |
| Extract token-merge invariants                                       | `125c4c152` |
| Extract `SessionAuthAdapter`                                         | `769eced0f` |
| Extract `CloudSession`                                               | `703060f76` |
| Extract `RelaySession` + delete `services.ts`                        | `0069b3fcf` |
| Host derives slots (lib)                                             | `c585520a7` |
| Remove boilerplate in the 4 apps                                     | `3e31eacf3` |
| Slot hook's subset subscription                                      | `45f258a9c` |

**9 cases where execution corrected the plan.** The plan document was wrong nine times, and
execution caught it every time. Four of those are **withdrawal judgments** worth recording
separately — cases where forcing something into one would have been a regression, or where
something was built and no consumer ever showed up.

| #   | Plan                                                | Actual                                                                                                                                                                                                                   |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Consolidate expiry math into `auth/utils/expiry.ts` | into `store/expiry.ts` instead. Store-passivity eslint blocks `store/**` → `../auth`, so only the store side is directionally possible                                                                                   |
| 2   | 31 unused public surfaces in apps                   | **32.** `setSessionAuthenticated`'s app "reference" was a single comment line                                                                                                                                            |
| 3   | include `wedged` in `AuthStatus`                    | excluded — 5 values. "sustained unverified" needs a time axis, so it can't be derived as a read-only projection                                                                                                          |
| 4   | migrate the auth-verdict copy in 4 places           | **2 places.** `useConnectivity` is a display verdict, and the relay guard uses two clocks under different policies (**withdrawn**)                                                                                       |
| 5   | concurrency guards 7 → 1                            | **7 → 2.** Coalescing (sharing a value, a Promise) and throttling (permission, a synchronous gate) are different mechanisms                                                                                              |
| 6   | merge the two guards into one `useCredentialGuard`  | **withdrawn.** relay is polling (30 seconds + verification edge), cloud is a self-arming deadline derived from `Expiration` — merging them yields a `mode` switch                                                        |
| 7   | just delete the existing `architecture.md`          | **merged instead.** §Responsibility split · §Assembly · §External usage rules · §Module structure, which existed only in that document, were moved over, and only then was it deleted (below)                            |
| 8   | split `ISocketManager` into 4 interfaces            | **withdrawn.** All four had zero consumers and were recomposed on the very next line — this would have created a new category of the thing Decision 6 was meant to cut, so only a group comment was left (**withdrawn**) |
| 9   | public value exports 110 → 78                       | **111 → 67.** The baseline was under-counted by one, and phase 2's intermediate value was recorded as final (the trajectory is in §Decision 6's correction note)                                                         |

Item 7 is what §Target structure missed. The v2 document went into detail only on **what changes**,
while per-engine responsibilities, the boot-order contract, and the module tree existed only in the
old document — deleting it outright would have lost those references. The inbound link count was
also off: the plan counted 19 links across 13 files, but the measured count was **15 links across 10
files** (2 in logger, 2 in data were each self-links pointing at their **own**
`architecture.md`). Because the file name was inherited as-is, no link path needed to change; what
actually needed fixing was the descriptive text and the line introducing v2 as a "Proposed
revision".

### Phase 8 — full unused-code sweep (2026-09-07, at the user's direction)

After being told the earlier phases had **grown the codebase**, a full sweep was run again. What
differs from phase 7 is the axis — phase 7 counted the _public surface_ against app imports, while
phase 8 counted _every export declaration and every class's public method inside the package_
against references across the whole repo.

Method: **260** `export const|class|interface|type` declarations and **191** candidate
4-space-indented public methods were pulled out, and each name's references were counted across the
entire source tree via `git ls-files`, separating out its own declaration file, tests, and barrels.
Files nobody imports were also counted separately (0 found).

**What was removed**

| Target                                                                                    | Grounds                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useProfileSync`                                                                          | 0 app consumers (test-only). The 2026-09 sweep kept it because "removing it breaks a family" — **that premise was wrong** — its supposed sibling `useJoinSync` never existed (see below) |
| `ISocketSlotLifecycle`·`ISocketTransport`·`ISocketObservability`·`ISocketScope`           | all four had zero consumers and were recomposed on the very next line. Correction #8                                                                                                     |
| `configureRelayEndpoints`                                                                 | a `@deprecated` name-preservation wrapper. Its only justification for staying was "`configure.ts` doesn't change", and it had exactly that one caller                                    |
| `readAuthSignals` · `createDataRuntime` · `createSocketRuntime` + 8 storage-key constants | 0 references anywhere in the repo despite being `export`ed — the declarations stayed, only the `export` was removed (no behavior change)                                                 |

**What was kept, and why**: 4 test seams (`resetGateways`·`resetNativeCacheSupport`·
`resetRelayRefreshCoalescing`·`getDataRuntime`) are actually imported by tests. `I*Store` ·
`ICloudSession` · `IRelaySession` · `ISessionAuthAdapter` · `ICredentialRenewer` have zero external
references but are the contract Decision 0 requires and the type for constructor injection, so they
stay. Three Props interfaces are React convention. `jsonSlot` · `Coalescer` · `Throttle` ·
`deriveAuthStatus` had their real usage counted (4, 7, 2, and however many, respectively).

**`useJoinSync` — a ghost created by documentation.** `apps/web/docs/architecture/data-flow.md` and
the 2026-09 sweep wrote down "5 sibling" sync hooks
(`useChatSync`/`useChannelSync`/`usePlaceSync`/`useProfileSync`/`useJoinSync`), but `useJoinSync`
**has zero definitions anywhere in the repo**. The real thing is the app layer's
`useJoinSyncRegistration`
(`apps/web/src/app/hooks/useMyJoins.ts:28`), and it isn't a hook wrapper — it directly calls
`syncManager.registerJoin()`. So the hooks app-runtime provides were only ever **3 siblings**, and
the "symmetry" that justified keeping `useProfileSync` existed only inside a document. Both
documents were corrected.

**Being honest: the code footprint still grew.** Phase 8 trimmed a little over 100 lines, and this
track as a whole grew production code by **+818 lines (+11%)** (see the measurement table). The
growth is what §Decision 0 required — interfaces + classes + constructor injection
(`services.ts` 539 lines → 4 files totaling 729) and 5 new mechanisms. What shrank isn't line count,
it's **public surface (111 → 67)** · **notification fan-out (8 → 1)** · **verdict copies (2 → 1)**.
Whether that trade was worth it should be read together with §Consequences' "what is accepted".

## Alternatives

**(a) Do nothing — write more documentation.** The justification comments for the current structure
are already longer than the code (100 of `useSessionStalenessGuard`'s 228 lines are comments). Piling
on more prose doesn't reduce §Context 1's seven sources, so the next incident would still need a
human to line up all seven by hand.

**(b) Merge the states into one — fold `selected`/`bound`/`committed` into a single value.**
Rejected. ADR-0070 Decision 7's grounds still hold in full (the optimistic transition breaks and
cross-cloud cache contamination returns). This ADR unifies only the **verdict and the notification
timing**, not the values.

**(c) Make the verdict a subscribable reactive store.** Rejected (this round). The verdict's inputs
are already independently subscribable (`subscribeKindVerified` · `sessionSignal`), and creating yet
another subscribable copy would just be the verdict version of the "three copies of the token"
problem §Context 1 raised. Keep it a **read-only projection** and get reactivity from the existing
subscriptions — `credentialFreshness` already has this shape.

**(d) Merge the two guards entirely (a `kind` parameter).** Rejected — same as the post-ADR-0070
judgment. Decision 3's footnote spells out the difference from doing it inside the renewer.

**(e) Introduce new suffixes (`*Service` · `*Strategy` · `*Impl`).** Rejected. 0 measured occurrences
in the repo, and a name is the first signal a boundary gives off. Following the `I*` + class
convention that 55 pairs already keep is cheaper for a new reader than inventing something new.

## Consequences

**What is gained**

- Auth state has a name (`AuthStatus`, **5 values** — `wedged` was dropped because it can't be
  derived). Logs, the overlay, and guards share the same vocabulary, so reproducing an incident
  narrows to a single question: "what was `status`".
- Cloud switching's observable intermediate states go from 7 to 0. Re-render fan-out goes from 8 to 1.
- The concurrency question ("can this fire twice?") goes from reading 7 files to reading 2 classes.
- ADR-0070 §0 now holds across the whole session hub — with no exceptions left, the principle
  becomes a rule.
- Public value exports go from 111 to 67. The ban on writing to stores directly is promoted from
  documentation to a type.
- `*Core` (a web-core leftover) is gone from the store interfaces, so the whole repo has one naming
  convention.
- Stores now take constructor injection, so they can be tested with fake storage.

**What is accepted**

- Phases 3-5 moved the verdict on the auth path. The shape a regression would take is a "silent
  malfunction" (renewal stops firing while the UI looks fine), so each verdict migration was
  confirmed to give the same answer as the existing copy with a truth-table test before the old
  copy was deleted. Even so, **3 real-device verification items are outside automation** — the
  manual checkpoints in architecture.md's §Verification method.
- Each call site's timing constants (3-second memo · 60-second cooldown · 30-second-to-5-minute
  exponential) were delegated to the two primitives. The values moved, unchanged, and the policy
  stayed at the call site.
- `apps/desktop-web` was touched in this track — the user explicitly included it. No uncommitted
  work was found at the start, and the tsc error count is 17, matching the baseline.
- **The number of ways to call something went down to one.** 10 of the 12 name-preservation
  wrappers were removed, and every internal call site now goes through `relaySession.x()` /
  `cloudSession.x()`. The remaining two are intentional because they're app-facing surface
  (§Open question 6). In exchange, test mocks became a singleton-object shape
  (`{ relaySession: { … } }`) — one line longer than mocking a single function used to be.

**Measured (after implementation)**

| Item                                         | Before                | After                            |
| -------------------------------------------- | --------------------- | -------------------------------- |
| `notifySessionStateChanged` calls            | 24                    | **0** (replaced by `emit(kind)`) |
| Fan-out per cloud switch                     | 8                     | **1**                            |
| Auth-verdict branch copies                   | 2                     | **1**                            |
| Hand-built concurrency guards                | 7                     | **2**                            |
| Public value exports                         | 111                   | **67**                           |
| `session/auth/services.ts`                   | 539 lines             | **deleted**                      |
| Relay token parses (per derivation)          | 3                     | **1**                            |
| jest (app-runtime)                           | 54 suites / 472 cases | **62 suites / 515 cases**        |
| Names outside repo convention                | 3                     | **0**                            |
| Production files (`src/**`, excluding tests) | 113                   | **119** (+6)                     |
| Production lines (same scope)                | 7,771                 | **8,589** (+818, +11%)           |

Four of the initial plan's numbers were corrected by execution (31→32 · verdict copies 4→2 ·
guards not 7→1 but 7→2 · `AuthStatus` has 5 values, not 6). The correction table in §Execution log
is the full record.

## Open questions

Updated to reflect post-implementation state. **1, 2, 5, 6, and 7 were answered in this track**
(struck through), 3 and 4 stay open pending product/backend input, and 8 hands off a decision once
measurement was finished.

1. ~~Whether to absorb `session/architecture.md`.~~ **Decided: keep it.** What was absorbed was only
   the existing `architecture.md`'s reference section. Session-hub detail stays in the sub-document
   — the new `architecture.md` passed 900 lines, and that document's §Responsibility split 1 hands
   the detail off to `session/architecture.md` as the SSoT.
2. ~~Merging `useSessionStalenessGuard`/`useCloudCredentialGuard`.~~ **Withdrawn.** Phase 5 execution
   confirmed the two guards' trigger models differ — relay is polling (30 seconds + a verification
   rising edge), cloud is a self-arming deadline derived from the credential's own `Expiration`. The
   common part is just `enabled` and `visibilitychange`, and merging would produce a `mode` switch —
   a shape the ADR-0070 guard comment already rejected. Both names stay.
3. **The device id's physical source.** Phase 0 removed a dead write (`persistDeviceId`'s raw
   `localStorage`), so there are two writers left. Whether "the device id being scoped to a tab
   session on web is intentional" is still open — it bears on the contract that push registration
   and socket identity must use the same id.
4. **Server-reported `expiresIn`.** `AUTH_OPTIONS.refreshIntervalMs = 5 minutes` is a fallback used
   because the server doesn't provide `expiresIn`, and both renewers' 5-minute margin is derived
   from it. Once the server starts reporting it, the margin's basis changes — the same waiting item
   as ADR-0070's open question.
5. ~~`Coalescer`'s final home.~~ **Kept in `libs/app-runtime/src/utils/`.** Promoting it to
   `@chatic/shared` can happen once a consumer needs it outside this package. Right now all 7 of its
   consumers are inside app-runtime.
6. ~~When to clean up the 12 wrappers.~~ **Cleaned up, 12 → 2.** The basis is a repo measurement: of
   this package's 6 `I*` + class + camelCase singleton modules, **4 export the singleton only**
   (`credentialRecovery` · `credentialFreshness` · `sessionAuthAdapter`, and `signal.ts`'s
   `subscribeSessionSignal`, which is a genuine convenience function of a different shape). The
   batch of name-preservation wrappers wasn't a convention, it was an **exception** whose reason for
   existing was "make the migration a pure path rename" — now that the migration is over, that
   reason is gone. 11 internal consumers were moved to method calls, and 9 wrappers were deleted.

    The remaining two are `createCredentialsByProvider` and `registerSessionLogoutCallback`. Their
    callers are apps, and **apps must not hold the singleton** — the first is an effect on the OAuth
    redirect page, the second is the log uploader's module initialization, and neither is React so
    neither can be wrapped in a hook. Having apps call the class method directly would require
    renaming the public surface, which was outside this track's purpose. Decided in a later round.

7. ~~The location of `session/store/expiry.ts`.~~ **Decided: keep it under `store/`.** There are two
   consumers and one of them is a store (`store/cloudStore.ts`'s cache-expiry check ·
   `auth/credentialFreshness.ts`). Store-passivity eslint blocks `store/** → ../auth`, so `store/` is
   the only location both can reach, and there's no reason to change the rule strong enough to
   outweigh one pure function's sense of conceptual belonging. Revisit once consumers pass three and
   the store one drops out.

8. ~~The `ServiceUnavailable` cluster.~~ **Confirmed as feature retirement, and deleted** (user
   decision, 2026-09-07). This is option (b) offered by the 2026-09 sweep's §4-1. Unreachability was
   confirmed by measurement: `setServiceUnavailable` has 0 callers, so there's no path left that
   turns the flag on (the 5xx-detection point at its introducing commit was the web-core refresh
   chain, which ADR-0070 removed), and `apps/web`'s `ServiceUnavailableOverlay` was also orphaned at
   `ada4e9b78`, when `app.tsx`'s mount was dropped. What was removed: 3 hook symbols · the overlay
   component · 3 barrel entries · a `jest.config.js` comment · and the `ko`/`en` translation keys.

    > **Correction.** This item's first draft gave "there aren't even translation keys" as a third
    > ground — wrong. The keys were in
    > `apps/web/public/locales/{ko,en}/translation.json` (I had only searched `libs/i18n-mobile` and
    > `apps/web/src`), and they were added to the deletion target. The unreachability grounds are
    > two.
