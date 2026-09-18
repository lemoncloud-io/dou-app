# ADR-0062 — Pin the MY tree's account profile to relay (relay token as source + relay-slot writes)

- Status: Accepted
- Date: 2026-08-19
- Supersedes: [ADR-0094](0094-relay-default-place-scoping-profile-step-and-avatar-unification.md) decision 5 (reverted 2026-08-06)
- Related: [ADR-0091](0091-relay-home-cloud-sheet-and-cloud-guide-redesign.md), [ADR-0042](0042-account-linking-unified-path-migration.md), [ADR-0052](0052-invite-local-cache-and-native-table.md), `libs/app-runtime/docs/socket/kind-scoped-routing.md`

> **Naming note (2026-09-01):** `*RemoteDataSource` · `RemoteGatewayBundle` · `*DomainGateway` ·
> `remoteFactory` · `remote/data-sources/`, as used in this document, are **names from that time**. Once
> the socket axis moved to the `Socket` prefix, the mapping is in
> [libs/data/docs/remote/README.md](../../libs/data/docs/remote/README.md#naming-history). This document is
> a record, so its body is left as written.

## Context

The MY page and its sub-screens (account info · edit profile · account linking · withdrawal) are all
**account-level** screens. But their display and editing both followed the active session, so while
connected to a cloud, the same screens showed and edited a **cloud delegation record** instead. A cloud
delegation issues a **different uid** from a separate backend (`POST {cloudBackend}/oauth/exchange-token`),
so to the user it looked like switching clouds changed their own account.

ADR-0094 decision 5 already flagged this and tried to pin `useMyUser` to relay scope, but it was
**reverted**. The cause was the cache: the local cache's physical key is `${type}:${cid}:${uid}:${id}`, and
`UserLocalDataSource`'s **read path ignores `contextOverride`**, so there was no way to read back the
relay `user` row while a cloud was active. Redirecting only the write destination to relay meant the
response was a relay account (relay uid) landing in a cloud-scoped cache partition, leaving
`useRuntimeProfile` (isGuest · permissions), which observes that partition, empty-handed.

Separately, one thing was already broken. `auth.linkAccount` had long been pinned to relay (the main user
lives behind relay, in the central backend), but its gate, `useLinkedAccounts`, was reading the active
session's `link$` — a read/write scope mismatch where a link made on relay reads back as "not linked"
inside a cloud.

## Decision

**1. Move the source from cache to the relay token.** Put `getRelaySessionUser()` /
`patchRelaySessionUser()` in web-core session. The relay token is
`UserTokenView extends UserView extends Partial<UserModel>`, so it already carries `name`/`photo`/`email`/
`link$`; it always exists and is always the relay account's. The cache-partition problem cannot arise here
by construction.

**2. Reactivity comes from the session signal.** `useMyUser` re-reads the token every time
`useGlobalSession()` re-renders. The session store discards its cached context and builds a new object on
every notify, so both a token refresh and our own writes fan out through the same path. There is no cache
to invalidate, and there is no flash gap since a value is present from the very first render.

**3. Writes are pinned to the relay slot.** `getRelayAccountGateway()` builds a `user.*` gateway on top of
`getScopedClient('relay')` (the same relay-pinning idiom as `remoteFactory`). It bypasses storage —
storage caches, and that cache is exactly the problem in point 1. The server response is written back into
the relay token, and that is the only fan-out.

**4. The data layer and `useRuntimeProfile` are left untouched.** `remoteFactory`'s `user` bundle stays an
active-scope facade. `isGuest`/`userRole`/permissions keep deriving from the active session — moving those
to relay too would be a separate decision that changes a path desktop-web shares. This change is scoped
strictly to **display and edit scope**.

**5. The cloud-profile edit row is removed from MY.** A cloud entity's name is not an account attribute.
The screen and route (`/mypage/cloud-profile`) keep their owner guard; only the entry point is removed.

**6. Fix a relay-token merge bug.** The relay branch of `commitServerRefreshedToken` did
`{ ...view, Token }`, which **did not merge the previous token**, so whenever a socket refresh view omitted
user fields, those fields disappeared. Now that the relay token is the display source, this means "the MY
header goes blank mid-session." Put `...previous` first, matching the cloud branch.

## Consequences

- The MY tree shows and edits one account regardless of cloud switching. Read and write share one scope
  (the relay token), so they cannot drift apart.
- `useLinkedAccounts`'s read now matches `auth.linkAccount`'s write for the first time. `PhoneVerifyBanner`
  · `ContactInvitePage` · `useSubscriptionIap` get the same fix for free — all of them ask about relay
  main-user identity.
- The relay profile has **no durable local cache.** Cold-start display comes from the token value, and the
  server's latest value catches up via a single `user.profile` push once the relay slot is verified. If
  there is no relay slot, the scoped client **throws** (no silent fallback) — so call sites gate on
  `useKindVerified('relay')`.
- `useSeedMyUserCache` remains, but its reader has changed: it is now a seed only for `useRuntimeProfile`.
- Left to do: a new entry point for renaming a cloud (a switch sheet, or account management). And
  cross-scope cache reads are still not opened by this decision — that stays a separate, still-open track.

## Alternatives

- **Route `user.profile`/`user.update` to relay in the data layer** — the path ADR-0094 decision 5 tried
  and reverted. The cache partition problem remains, and the uid `useRuntimeProfile` observes stays out of
  step with the uid in the response. Going through `libs` also reaches desktop-web.
- **Write to cache only when `cid === 'default'`, like `InviteRepository`** — avoids partition
  contamination while still using storage, but the cache is empty while a cloud is active, so every read
  would still have to hit the socket — at which point there is no reason left to use storage. Reading the
  token directly is shorter and more honest.
- **Fetch/edit the profile over relay HTTP** — no such endpoint exists in
  `libs/web-core/src/api/users.ts`. The old `PUT /users/{uid}` was removed when it was replaced by a socket
  action.
