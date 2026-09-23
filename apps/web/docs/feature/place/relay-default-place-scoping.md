# relay default place scoping — one place that must not leak into a cloud

The relay account owns exactly one place, id `0000`, and the server ships it **embedded in the user
profile response** (`user.profile` → `$site`) rather than only in the place list. The local cache is
partitioned per cloud. Put those two together and the row lands wherever the app happened to be
looking when the profile arrived — so a place that belongs to the relay shows up in a cloud's place
list, and keeps showing up, because nothing in the list response ever mentions it.

Five mechanisms keep that from happening, and one consequence follows for every account-level
screen. This document is those six, in the order a reader meets them.

## Layout

Four of the five mechanisms live in `@chatic/data` — the write gate on `UserRepository`, list
reconciliation and the create/update rules on `PlaceRepository`, the read-time filter in
`PlaceLocalDataSource`, and `isForeignContext` in `scopeGuards.ts`. The app supplies the policy in
`main.tsx`, polls the reconciliation from `useBackgroundSync`, and owns the sixth piece outright:
the account profile read in `useMyUser` and written through `relayAccountGateway`.

## Responsibilities

Everything here decides **which partition a row may be written to, and which rows a partition may
hand back**. None of it decides what a screen renders.

The division is deliberate: `libs/data` ships the mechanism with its current behaviour as the
default, and the app supplies the policy. `UserRepository` persists the embedded `$site` unless an
injected predicate says otherwise, so a consumer that never injects one — the desktop shell — sees
no change at all.

## The shared contract

### The partition, and the one thing it cannot do

A cached row's physical key is `${type}:${cid}:${uid}:${id}`, computed by the storage adapter from
the provider it was handed — one fixed to a single partition. A local data source picks that adapter
from the operation's context: the `contextOverride` a repository captured, or the live context when
there is none. (Until ADR-0112 the override reached only the observer key and the `cid` stamp; the
read path followed the live context.) The full model is canon in
[`@chatic/data`](../../../../../libs/data/docs/local/README.md#scope-and-cache-slots).

Two consequences run through everything below:

1. A row written under the wrong `cid` is not mislabelled — it is in a different place entirely, and
   only a read under that same `cid` will ever see it again.
2. While a cloud is active, a relay-partition row is **out of the repositories' reach**: they read
   under the live scope, and the user repository takes no override. That is why §6 ends where it
   does.

### 1. The write gate — `persistEmbeddedSite`

`UserRepository.getMyProfile` writes the response's embedded `$site` into the place cache.
A constructor option gates it: a predicate over the `DataContext`, which the repository consults
before persisting. Absent, it persists — the previous behaviour, unchanged for anyone who does not
opt in. The web app opts in during boot, allowing the write only while the context is the `default`
partition, before the first repository access creates the data runtime.

The path is `initAppRuntime` → `configureDataRuntime` → `DataManager` → `createRepositories`. The
runtime singleton is lazy and builds its repositories once, so a late call cannot apply; it warns
and is ignored rather than rebuilding shared state underneath live subscribers.

This stops new pollution. It does nothing about a row already sitting in a store from before the
gate existed — that is §2 and §3.

### 2. Reconciliation — the list response is authoritative

`PlaceRepository.refreshList` delegates to a private `syncListSnapshot`, which follows the idiom
`ChannelRepository` established:

1. **Foreign-context guard.** `isForeignContext` is true when the socket is still bound to a
   different cloud than the `cid` the request was captured under — mid-switch, in other words. The call returns without
   touching the cache and records the drop with the aggregator, because writing the outgoing
   cloud's answer under the incoming cloud's key is the exact poisoning this document is about.
2. **Empty-response protection.** A list that comes back empty is not evidence of an empty account;
   right after a switch the session may simply not be ready. Nothing is written and nothing is
   pruned.
3. **Order stamp and write.** The list index is stamped as `order` so the rail's ordering survives
   into the cache, then written with `cacheWriteMany`.
4. **Stale prune.** Cached rows the server no longer lists are deleted. Only a **full** snapshot may
   prune — `query != null` returns before this step, because a filtered response proves nothing
   about the rows it omits.

Reconciliation is what makes a one-off migration unnecessary. A migration fixes the rows that exist
when it runs; reconciliation converges no matter how a row got there, including from an older client
still writing them.

Note why a plain list filter cannot do this job in general: a row's `cid` is stamped from the
partition it was written under, so a polluted row carries the same `cid` as a legitimate one. There
is nothing on the row to tell them apart — except for one id, which is §3.

The only production caller is `useBackgroundSync`, on a 60-second poll plus foreground return,
verification edges and site switches. Pollution left over from before the gate clears on the first
tick after the app loads.

### 3. The read filter — one reserved id

Place id `0000` is the relay's single personal place, and it can only legitimately exist under the
`default` partition: no cloud issues that id to a place of its own. That makes it the one case where
`cid` alone settles the question.

`PlaceLocalDataSource` drops it at read time — `cacheRead` returns `null` and `cacheReadList`
filters it out whenever `id === '0000' && cid !== 'default'`. This runs independently of §2, so a
polluted row is invisible immediately rather than after the next sync tick.

The constant is duplicated rather than imported from `apps/web`'s `HOME_PLACE_ID`: the app depends
on `@chatic/data`, not the other way round.

### 4. `createPlace` takes its own snapshot

`order` stamps come only from the list response, so a place created with a single `cacheWrite` would
sit unordered until the next background tick. `createPlace` therefore calls `syncListSnapshot`
itself, with the new id passed as `protectedId` so the prune in §2 cannot delete a row the list
response has not caught up with yet.

The follow-up is best-effort: the place already exists on the server, so a failed snapshot must not
fail the create. The next tick converges. It lives inside the repository so every caller gets it
without remembering to.

### 5. `place.update` carries `id`

The backend requires `@id` on `place.update`, and for a place the id **is** the sid. A payload with
only `sid` is normalized at the repository entrance, which keeps two things working at once: the
remote call stops returning 400, and the optimistic write plus its rollback — both keyed by `id` —
stay engaged instead of being skipped.

The app-side payload type (`UpdatePlacePayload`) also makes `id` required, so a caller that forgets
fails to compile. The normalization is the second line of defence, not the first.

### 6. The account profile is read from the relay token, not the cache

Account-level screens — MY page and everything it opens — must show the **relay** account no matter
which cloud is connected. A cloud session mints a different uid on a different backend, so the
cloud-delegated `user` record is a different record with different values.

The cache does not answer this. Per the rule above, while a cloud is active the relay `user` row
lives in a partition the repositories do not read, and even a read pinned there would only see
whatever a relay-scoped write last left. An earlier attempt to solve this inside the data layer was
abandoned when the override could not reach the read path at all.

What works instead is app-level and touches no cache:

- **Read** — `getRelaySessionUser()` extracts the user fields from the stored relay token
  (`UserTokenView extends UserView`, so it carries `name` / `photo` / `email` / `link$`). `useMyUser`
  re-reads it on every session signal; the store hands back a fresh context object on each notify,
  which is the re-render trigger. There is no cache to invalidate and no flash on first paint.
- **Write** — `getRelayAccountGateway()` builds a `user` gateway over `getScopedClient('relay')`,
  pinned to the relay slot rather than following the active facade. The response is patched back
  into the stored token, and patching the token **is** the update path: every reader sees it at once
  and the next cold start seeds from it.
- **Gating** — the scoped client throws rather than falling back when no relay slot is bound, so
  callers must wait on `useKindVerified('relay')`. Firing before the relay handshake is what
  produced `503 SOCKET NOT CONNECTED` elsewhere in the app.

The one-shot `user.profile` refresh exists to catch an edit made on another device; it is pinned and
gated the same way.

## Usage

### Adding another app-level partition policy

`persistEmbeddedSite` is the template for "this shared write should not happen in my app". Four
steps:

1. Add the predicate as an option on the repository that performs the write, defaulting to today's
   behaviour when it is absent. A new option must never change what an existing consumer does.
2. Thread it through `DataRepositoriesOptions` so `configureDataRuntime` can carry it.
3. Register it in the app's boot call, before anything touches a repository.
4. Add a repository test for all three cases — not injected, injected and approving, injected and
   vetoing — and assert that a veto still performs the write the option is not about (the user row,
   in this case).

### What not to do

- **Do not add a read-time `cid` filter for a general case.** It works for id `0000` only because
  that id is structurally reserved. Every other place id can legitimately exist in more than one
  partition, and a filter would hide real rows.
- **Do not prune on a filtered response.** A query-scoped answer says nothing about the rows it left
  out.
- **Do not write through a foreign context.** If `isForeignContext` is true, the answer in hand
  belongs to a cloud that is no longer active. Return; the next tick is correct.
- **Do not route the account profile through a repository.** Repositories cache, the cache is
  partitioned, and the partition is the whole problem. This is the one place in the app that reads a
  server record out of a token on purpose.
- **Do not reach for `contextOverride` to read the relay account from a cloud.** It does reach
  storage now (ADR-0112), but it reads only the relay partition's cached row — possibly stale,
  possibly never written. The token is always present and always the relay account's.

## Notes for implementers and tests

```bash
npx jest --config libs/data/jest.config.js --testPathPatterns="UserRepository|PlaceRepository|PlaceLocalDataSource"
npx jest --config apps/web/jest.config.js --testPathPatterns="useMyUser|CreatePlaceDialog"
```

What those cover, and what they cannot:

- `UserRepository` — the gate in all three states, with the user write itself unaffected by a veto.
- `PlaceLocalDataSource` — a polluted `0000` row is filtered from the list and `null` from a single
  read, while the same id under `cid: 'default'` reads normally.
- `PlaceRepository` — no write under a foreign context, nothing written or pruned on an empty
  response, stale rows pruned on a full snapshot but not a filtered one, `createPlace`'s follow-up
  and its prune protection, `id` normalized from `sid` on both the remote payload and the optimistic
  write.
- **The owner-side flows are not reproducible in a local preview.** Creating a place and the owner
  screens need a real owner cloud session; unit tests are the only coverage there.
- **Pollution is not reproducible by clicking, either.** It requires a profile fetch landing while a
  cloud is active with the gate removed. To see the read filter work, write a `site:*` row with id
  `0000` and a non-default `cid` directly into the IndexedDB cache store and reload.

## Further reading

- [README.md](./README.md) — the place screens themselves.
- [home/README.md](../home/README.md) — the place list and the create flow that §4 serves.
- [mypage/README.md](../mypage/README.md) — the account screens that §6 is written for.
- [`@chatic/data`](../../../../../libs/data/docs/local/README.md#scope-and-cache-slots) — the scope
  and cache-slot model this document depends on.
- [`@chatic/app-runtime`](../../../../../libs/app-runtime/README.md) — the session store, the relay
  token, and kind-scoped socket routing.
