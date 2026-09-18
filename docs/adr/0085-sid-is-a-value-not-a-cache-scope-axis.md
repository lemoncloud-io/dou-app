# ADR-0085: sid is a value, not a cache scope axis

> Status: Accepted · Decided: 2026-09-14 · Related:
> [ADR-0051](./0051-cache-storage-routing-simplification.md) (owner of storage scope policy),
> [ADR-0070](./0070-app-runtime-session-hub.md) (derives the selected context),
> [ADR-0100](./0100-libs-data-doc-canon-and-layer-flattening.md) (prior cleanup of the same lib)

## Context

`DataContext` carries three values: `cid`, `sid`, `uid`. Of these, only `sid` does two jobs at once.

| Role                              | Where it's used                                                                         | Status          |
| --------------------------------- | --------------------------------------------------------------------------------------- | --------------- |
| **Value** (request · filter · id) | Profile id `${sid}@${uid}`, the server payload's `siteId`, per-site channel-list filter | Still in use    |
| **Axis** (partition dimension)    | Observer scope hash `getScopeKey`                                                       | No basis for it |

Below is the record of why the second role lost its basis.

### Storage does not partition by sid

The physical partition is defined by `AdapterScope`, and it has exactly two fields.

```ts
// libs/data/src/local/ports/policy.ts:36
export interface AdapterScope {
    cid: string;
    uid: string;
}
```

The storage key says the same thing — `"channel:cid:uid:id"`
(`libs/data/src/local/ports/cacheStorage.ts:55`). `resolveScopedContext` (`policy.ts:87`) just returns
`resolveBaseScope` unchanged, aside from pinning `invitecloud` to global — and sid isn't there either.

**sid has never reached storage.** As a scope axis, sid only ever existed in the observer registry.

### But the observer scope key does include sid

```ts
// libs/data/src/local/data-sources/types.ts:149
protected getScopeKey(contextOverride?: LocalDataSourceContextOverride): string {
    const context = this.getContext(contextOverride);
    return stableHash({
        cid: context.cid || 'default',
        sid: context.sid || '',
        uid: context.uid || 'default',
    });
}
```

The result is one thing: **a single physical partition splits into multiple observer scopes.** A value
written under sid=A does not wake an observer subscribed under sid=B — even though both are reading the
same row. Subscription and republish pass through the same function, so they never disagree with each
other — they're just consistently wrong together.

### 3 of the 9 already removed this axis

There are 9 data sources. Three of them already used an override to align scope with the storage
partition, and **all three left a comment recording the same incident.**

| Data source                 | Override   | Incident recorded in the comment                                                                                                                                                            |
| --------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PlaceLocalDataSource:57`   | `sid: ''`  | Timing mismatch during a cloud switch, when sid was cleared and later reselected — the rail appeared empty even though the cache had rows (`placeCache>0` while `usePlaces` returned empty) |
| `ChannelLocalDataSource:35` | `sid: ''`  | Same failure. Per-site isolation is handled by the list key `\|sid:<sid>\|` instead                                                                                                         |
| `CloudLocalDataSource:42`   | `'global'` | Storage is one single global partition, but scope was still split by whatever cid/sid/uid happened to be active                                                                             |

All three arrive at the same conclusion — **align the observer scope with the storage partition.**

### The remaining 6 still carry the same mine

| Data source | How it uses sid                                                              | What the scope key's sid does        |
| ----------- | ---------------------------------------------------------------------------- | ------------------------------------ |
| `Profile`   | The list key already has a resolved sid in it (`ProfileLocalDataSource:244`) | Nothing. Only splitting risk remains |
| `Chat`      | Only read as a write guard (`:193`, `:225`)                                  | Nothing                              |
| `Join`      | Only read as a write guard (`:78`, `:114`)                                   | Nothing                              |
| `Invite`    | Not read                                                                     | Nothing                              |
| `User`      | Not read                                                                     | Nothing                              |
| `SyncMeta`  | Not read                                                                     | Nothing                              |

Profile is the clearest case. Since the list key already carries sid, the scope key's sid adds nothing to
isolation. All that's left is the splitting effect.

### Chat and Join's guards have no consumer

Both throw at write time if `context.sid` is missing. But **that sid is never stored on the row, and
never used in a key.** It's received, checked for presence, and discarded.

This guard rode in with `9f4706886` (2026-06-28, V1 data-source removal). Even at that point, there's no
trace of sid entering a storage key. It looks inherited rather than a deliberate decision.

Profile's sid requirement is a different kind of thing. Since the profile id is `${sid}@${uid}`, **there
is no key to write without sid.** It looks like the same `assertRequiredString`, but one of these is a
contract and the rest is a leftover.

### There's already one call site that's out of sync

`JoinRepository` always writes with the **ambient context** (`cacheWrite` → `getRepositoryContext()`,
`JoinRepository.ts:81`). Reads, on the other hand, take an override (`observeList`, `:47`).

`apps/web`'s `useMyJoins` puts the **channel's own sid** into that override.

```ts
// apps/web/src/app/hooks/useMyJoins.ts:101
{ cid: selectedCloudId ?? 'default', sid: channelById.get(id)?.sid, uid }
```

When the selected site differs from that channel's sid, the two hashes differ. Writes register under the
selected sid; the subscription registers under the channel's sid. Structurally, republish can never reach
it.

Two other hooks in the same repo already go the other way — `useActiveCloudChannels:73` and
`useAwaitInviteChannel:102` pass the override as `{ cid, uid }` only. They're commented "SCOPE PINNING,"
and never put sid in to begin with. **apps/web has already stopped treating sid as an axis.**
`useMyJoins` is the last exception.

### Ambient sid has already caused an incident on write

`switchSite` **applies sid first and exchanges the token afterward** — `applySelectedSite(siteId)`, then
exchange, rolled back on failure (`libs/app-runtime/src/socket/auth/switchSite.ts:41`·`:57`). During that
window, ambient sid and the site the server is actually using disagree.

`apps/web` already routes around that window.

```ts
// apps/web/src/app/hooks/useSetMyPlaceProfile.ts:27
// Pinned write. `setMyProfile` reads the sid off the ambient context, which a site
// switch only PRE-APPLIES optimistically before the token commits (app-runtime
// `switchSite`) — a write racing that switch lands on the previous place. The
// place-create flow knows exactly which place the profile belongs to, so it says so.
```

The place-creation flow knows exactly which place the profile belongs to, so it doesn't trust ambient
sid — it passes `siteId` directly. **The judgment that ambient sid can't be trusted already exists in the
code.** It just lives in one call site.

### The read-side ambient fallback has no consumer

Counted them. Every app call site that opens a channel or profile list **passes sid explicitly** — either
the real sid, or `''` meaning "all" (`useHomeChannels`, `useActiveCloudChannels`,
`useAwaitInviteChannel`, `useChannelProfiles`, `useSenderProfiles`, and desktop-web's `useChannels` ·
`useChannelChatFeeds` · `useDesktopNotifications` · `useChatOutbox`). Nowhere does the
`query.sid ?? context.sid` fallback actually get taken.

The app already has sid in hand — there are 66 places that read `selectedSiteId`.

## Decision

### 1. Producers stop planting sid. The field remains as an explicit-pass-through mechanism

There is exactly one source of ambient sid: the line in `deriveSelectedContext` that layers the session's
active site onto the context (`libs/app-runtime/src/session/scope/selectedContext.ts:32`). **That line is
deleted.** Repositories that need a site take it as an argument, and attach that value directly onto the
context they pass further down.

The `DataContext.sid` field stays. It is not removed, and the reason comes from measurement.

| Response           | Carries sid?  | Basis                                                               |
| ------------------ | ------------- | ------------------------------------------------------------------- |
| `profile.get-mine` | **Yes**       | Measured — `siteId: "0000"`                                         |
| `profile.sync`     | **No**        | Server type `ProfileSyncMap` = `uid → {nick, thumbnail, updatedAt}` |
| `channel.get-self` | **No**        | Measured — none of its 14 keys has sid, nor does `$`                |
| `channel.mine`     | **No**        | `ChannelModel` has no sid field at all                              |
| `channel.sync`     | Yes — `$.sid` | `ChannelRepository` filters on the assumption that it's there       |

**Three responses don't send a site at all.** The only path that attaches a site to that row is the sid
carried through context, from caller → repository → remote → mapper. Removing the fallback would make it
`sid: ''`, and `ChannelLocalDataSource.cacheWrite` would throw.

So the three groups get handled differently.

| Group                          | Location                                                                                                                          | Treatment                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Read defaults**              | `ChannelLocalDataSource:55`·`:208`, `ProfileLocalDataSource:37`·`:244`                                                            | Removed. No call site takes it       |
| **Write tag/mapping fallback** | `mappers:93`·`:215`, `ChannelLocalDataSource:111`·`:153`, `ProfileLocalDataSource:190`·`:219`, `ProfileSocketDataSource:54`·`:74` | **Kept.** Now filled only explicitly |
| **"My current site" contract** | `ProfileRepository`, `ChannelRepository`                                                                                          | Raised to an explicit argument       |

Signatures that change:

- `setMyProfile(body)` → `setMyProfile(body, siteId)` (and made `async`, so a missing siteId rejects
  instead of throwing synchronously)
- `syncProfiles(since)` → `syncProfiles(since, siteId)`
- `setProfile`'s `input.siteId || context.sid` fallback goes away; `input.siteId` becomes required
- `refreshList(query)` requires `query.sid`
- `createChannel(payload)` → `createChannel(payload, siteId)`
- `getSelfChannel(payload)` → `getSelfChannel(payload, siteId)`

The last two are paths that **write a row into the cache for the first time**, so an explicit value is
required. The rest (`updateChannel` · `inviteChannel` · `leaveChannel`) already have a cached row, so
`existing?.sid` covers them.

> **Two corrections made 2026-09-14 (mid-implementation).**
>
> 1. `refreshList` was first classified as a "read default." That was wrong. The `targetSid` it produces
>    doesn't just attach a site to the response row — it also opens the **prune gate**
>    (`answersForTarget`). Dropping only the fallback leaves `targetSid` as `undefined`, and **a response
>    describing a different site would then wipe this site's cache.**
> 2. This decision originally read "remove sid from `DataContext`." Measurement overturned that — per the
>    table above, the mapper's fallback was the **only surviving path**. Removing the field too would
>    mean adding a `siteId` parameter to about 10 remote-layer methods, and having `update`/`invite`/
>    `leave` look up the site from the cached row first. The runtime behavior would be the same as just
>    turning off the producer. The only thing gained would be a type guarantee, which isn't done for now.

Call sites already had the site in hand. `useSetMyPlaceProfile`'s two branches (pinned / ambient) merged
into one, and the comment that created that branch is gone with it.

14 call sites changed, across three apps.

| App            | Location                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| `apps/web`     | `PlaceProfilePage`, `useSetMyPlaceProfile`, `useChannelMutations`, `useBackgroundSync` (×2)                   |
| `apps/testbed` | `RuntimeOverlay`, `ChatHomePage` (×2)                                                                         |
| `desktop-web`  | `useMyProfile`, `useChannelMutations`, `useBackgroundSync` (×2), `useRealtimeProfileSync`, `useRefreshOnPush` |

Only `useRefreshOnPush` didn't have the site in hand, so it now reads the session's selection too — via a
ref. Putting it in the dependency array would rebind the push listener every time the site changes; four
neighboring hooks use the same pattern for the same reason.

The plumbing goes with it too — `getNormalizedContext`'s sid normalization and
`BaseLocalDataSource.getSid` are deleted once nothing reads them anymore.

### 2. Remove sid from the base `getScopeKey`

Scope becomes `{cid, uid}` — the same shape as the storage partition's definition (`AdapterScope`).

The two overrides (`Channel` · `Place`) become identical to base, so they are **deleted**. `Cloud`'s
`'global'` override stays — it isn't about sid, it's about pinning cid/uid, and pairs with
`resolveScopedContext`'s `invitecloud` branch.

The incident each override's comment recorded is not lost — it moves onto the base `getScopeKey`
comment.

### 3. Delete Chat's and Join's sid write guards

Two spots in `ChatLocalDataSource`, two in `JoinLocalDataSource`. A gatekeeper with no consumer.

**Profile's sid requirement stays.** It's part of the id, so it's a contract.

There is a separate net that catches writes made before the session is ready. If uid is missing,
`resolveBaseScope` returns `null`, and `BaseDbAdapter.getScope` logs one warning and skips cache access
(`libs/db/src/base/BaseDbAdapter.ts:32`). That net stays in place even after the sid guard is removed.

### 4. Clean up the call site that passed sid only because of the guard

Remove sid from `useMyJoins`'s override. It becomes `{ cid, uid }`, matching the shape of the two other
hooks in the same file.

The reason this cleanup rides along: if the guard stays, so does the call site's sid pass-through, and
**the distinction between "value sid" and "axis sid" blurs again in the code.** That is exactly where the
boundary this ADR is drawing would collapse.

### Out of scope

- **sid in query arguments is unchanged.** Things like `channel.observeList({ sid })` and
  `profile.cacheReadList({ sid })`. That's where sid lives as a value. `apps/desktop-web`'s uses of sid are
  entirely this kind, so they are unaffected by this decision.
- Not mixed with removing the `V2` suffix (ADR-0100 Decision 4).
- Partitioning storage by sid was not evaluated as a direction.
- sid **on a row** — like `DomainChannel.sid` and `DomainProfile.sid` — is unchanged. What disappears is
  the producer that automatically attached sid onto the context.
- Removing the sid field from `DataContext` is not in this scope (see Decision 1's second correction).

## Lost (intended loss)

- **sid-level observer isolation.** Today, observer groups split when sid differs. After this, groups for
  the same `{cid, uid}` merge into one. Round trips to storage actually go down — where two groups used to
  read the same physical row separately, it's now one read, and republishes that were being missed now
  reach.
  **The cost is one invariant a human now has to keep.** If a read depends on ambient sid, and a data
  source exists that doesn't put that sid into its list key, the merged group will conflate two different
  reads into one wrong answer. Today, no such data source exists — `Profile` and `Channel`, the ones that
  filter by sid, put the resolved sid into their list key (`ProfileLocalDataSource:244`,
  `ChannelLocalDataSource:208`), and the rest don't read sid at all. Up to now, the scope key's sid was
  **accidentally** covering for that mistake. After this, it no longer does. This isn't a new rule —
  `ChatLocalDataSource:306` already states it: "every field that reaches storage must be in the key."
- **The net that used to fill in a site for you disappears.** Where a site is needed and the caller
  doesn't supply one, it now fails loudly with `[Repository] siteId is required.` Previously, the active
  site was silently substituted. **A quiet mistagging becomes a loud failure, and that's the point** —
  the value being silently substituted was wrong exactly during a site switch. Where a screen writes
  without knowing the site, what used to be saved (wrongly or not) now fails instead. The 14 call sites
  changed all already had the site in hand, so there's no actual exposure.
- **If storage is ever partitioned by sid in the future, this decision has to be reversed.** The cost is
  small — that work would start by changing `AdapterScope` and the storage key anyway, and restoring the
  scope key is one line of that work.
- **The "sid is missing" signal disappears from Chat and Join writes.** That signal never actually caught
  anything, but it was a spot that failed loudly when session init order broke.

## Alternatives considered

- **Keep `DataContext.sid` and redefine its meaning only in a comment.** (Fix docs and comments, leave the
  code as is.) **Rejected** — the ambient sid left in place isn't a neutral leftover, it's the cause of
  write races, and a comment can't stop that. `useSetMyPlaceProfile` already proved it by working around
  it in code.
- **Remove the sid field from `DataContext` entirely.** If only what needs it takes it as an explicit
  argument, meaning confusion becomes structurally impossible. **Rejected (for now)** — exactly as
  written in Decision 1's second correction. Measurement showed the mapper's fallback was the only
  surviving path, and removing the field means adding a parameter to 10 remote-layer methods, with three
  of them needing a cache lookup for the site first. The runtime behavior would be the same as just
  turning off the producer.
- **Keep the overrides and only fix base.** Keep `Channel`'s and `Place`'s overrides as explicit no-ops,
  to make "sid isn't used here" visible. **Rejected** — that leaves two copies of code identical to base,
  and the next time base changes, the two would silently drift. There's no reason to keep in code what a
  comment can record just as well.
- **Fix the scope key only, and leave the Chat/Join guards.** A smaller change. **Rejected** — for the
  reason written under item 4.

## Known side effects

- **Test coverage here is thin.** Every data-source test in `libs/data` pins the context's sid to a
  single fixed value. No test asserts isolation between two observers with different sids. In other
  words, no existing test blocks this change — but **no existing test protects it either.** The
  implementation stage adds a new test that pins down "two observers with different sids but the same
  `{cid,uid}` both wake on one write."
- **`useMyJoins`'s mismatch is fixed by this ADR, but it has never been observed as an actual symptom.**
  This is a conclusion drawn from structure. It only surfaces under the condition where a channel from a
  site other than the active one shows up on the home screen alongside it.
- **File paths in this document assume the state after the `V2` suffix removal.** As of writing, the
  worktree has an uncommitted rename, `repositories-v2` → `repositories` and `data-sources-v2` →
  `data-sources` (the work ADR-0100 Decision 4 deferred). If that change is reverted, read this
  document's paths with `-v2` added back.
