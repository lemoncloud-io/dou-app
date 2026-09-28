# ADR-0118: A sync target belongs to its cloud's slot, not to the active slot

> Status: Accepted · Decided: 2026-09-28 · Implemented: `refactor/per-slot-sync`
> · Scope: `libs/app-runtime/src/socket/sync/**` · `libs/app-runtime/src/data/DataManager.ts` ·
> `libs/app-runtime/src/data/factories/socketFactory.ts` · `libs/app-runtime/src/session/store/contextStore.ts`
> · Builds on: [ADR-0115](./0115-a-socket-slot-is-keyed-by-the-cloud-it-serves.md) (slots keyed by cid) ·
> [ADR-0116](./0116-the-active-socket-slot-is-a-pointer-the-binder-sets.md) (the active slot is a pointer) ·
> [ADR-0117](./0117-socket-auth-is-keyed-by-the-slot-s-cloud.md) (auth keyed by the slot's cloud)
> · Amends: [ADR-0058](./0058-navigation-churn-grace-and-seeding.md) decision 1 — grace entries are
> purged when their own cloud's slot rebinds, not on an active client swap
> · The module docs are [libs/app-runtime/docs/sync](../../libs/app-runtime/docs/sync/README.md) and
> [docs/data](../../libs/app-runtime/docs/data/README.md#scoped-repository-graphs)

## Context

`SyncManager` already ran one sync runtime per bound slot, because a slot's runtime owns its
connect-driven `device.save` and has to live as long as the slot. The **targets** did not follow.
There was one registry, keyed `${type}:${id}`, and targets ran on the active slot's runtime only. On
every active change the outgoing runtime stopped all of its targets, grace-period entries were purged,
and the whole registry was replayed onto the incoming runtime, filtered by "does the target's cloud
match the active slot's".

What a plan did with a frame followed the same shape. Every plan callback wrote through the app's
repository graph, whose scope is the **selected** cloud, and a guard dropped the frame whenever the
slot's cloud disagreed with the selection.

That only worked while "the cloud a target belongs to" and "the cloud of the active slot" were the
same thing, and in the one window where they are not — a switch, with the selection flipped and the
outgoing slot still active — it needed a guard at every step:

- a target registered for the incoming cloud had to be kept off the outgoing socket (a cloud place
  once polled `place.get` on the relay and got `404 not found @doGet(sites/…)`);
- the outgoing cloud's frames were dropped rather than written, so whatever arrived in the window was
  lost;
- channel ids are unique only inside one cloud, so a registry keyed by id alone would merge two
  clouds' `channel:1000001` into one target as soon as both could be registered at once.

The goal this is a step toward is one socket session per joined cloud: a background slot for cloud A
must be able to hold A's targets and write A's rows while B is on screen. With targets tied to the
active slot, a background slot could never hold one.

## Decision

1. **A target names its cloud.** `register(target, { cid })`; the default is the cloud the session
   has selected at registration. The cid is fixed for the entry's life. The registry key is
   `${cid}|${type}:${id}`, so the same id in two clouds is two targets, each with its own ref count
   and grace.
2. **A target runs on the runtime of its cloud's slot, and only there.** When that slot binds, its
   cloud's registered targets start on the new runtime; when it is torn down, they go down with it and
   their entries wait for the next slot of the same cloud. The manager no longer subscribes to the
   active client at all: moving the active pointer stops nothing and starts nothing.
3. **Grace-period entries are purged when their own cloud's slot rebinds.** That is ADR-0058's rule
   moved from "an active client swap" to "a new runtime for this cloud", for the same two reasons —
   a purged entry never resumes a departed screen's polling, and a re-registration never falls into
   a merge path that does not start. Other clouds' grace entries are untouched.
4. **A plan writes through its slot's cloud's scoped repository graph.**
   `DataManager.getScopedRepositories(cid)` is a graph pinned to one cloud. Its context is that cloud
   and the uid this account has there (`getUidInCloud`), read per call, with `socketCid` set to the
   cloud itself; its socket calls go through that cloud's slot (`getScopedClient`); and its local data
   sources are the app graph's own, so a write still wakes the observer a screen registered. Built on
   first use, kept for the session.
5. **The cross-cloud frame guard is removed.** A plan writes through its own slot's cloud's graph, so a
   frame and the partition it lands in cannot disagree; the guard could no longer fire, and what
   keeps the property true is the scoped graph itself, which its tests pin.
6. **The uid a target is tagged with depends on whether the caller named its cloud.** Named: the
   uid this account has in that cloud (`getUidInCloud`: the relay token's for the relay, otherwise
   the token that cloud's socket signs with, falling back to the identity ADR-0117 records). Not
   named: the session's uid, because such a caller built the target from the session — an app's
   `join` ids embed the session uid. The two agree whenever the selected cloud is the committed one;
   in a switch window the session tag is what retires a registration at the commit, before its stale
   id could be polled on the incoming cloud's slot. An account change retires the targets whose tag
   no longer matches their cloud's uid. Remembered channel refusals, keyed by channel id alone, are
   still cleared on a change of the session's own uid, which moves with both the account and the
   cloud.
7. **The screen hooks follow the selection.** `useSyncTarget` passes the selected cloud explicitly and
   re-registers when it changes, or when the uid in that cloud changes; chat prime gates on that
   cloud's slot (`useSlotVerified`), reads and fetches through its scoped graph, and hands the baseline
   to its runtime (`updateLocalSnapshot(…, { cid })`).

## Alternatives

- **Keep targets on the active slot, and replay them per cloud.** The smallest diff, and it keeps
  every guard. But it cannot express a target on a slot that is not active, which is the one thing
  background slots need, and it keeps losing the frames that arrive during a switch.
- **Hand the app graph back for the active cloud.** It would keep the active slot's writes
  byte-for-byte on today's path. It also puts them back on the selection: during a switch the active
  slot's frames would follow the selected cloud again and need the live guard again. The scoped graph
  gives the same partition in the steady state and the right one in the window.
- **Evict a cloud's scoped graph when its slot is torn down.** It holds nothing tied to one socket —
  its client resolves the slot per call — and it is one small object per cloud visited, like the
  storage-per-partition memo underneath. An eviction would need a slot subscription in `DataManager`
  and would buy nothing.
- **Leave the hooks registering under whatever cloud `register` reads.** A component that stays
  mounted across a switch would keep its target on the previous cloud until the uid changed at commit,
  and only then move. Passing the selection makes the move happen when the rows it renders move.
- **Compare every target against the session's uid**, as before. The session uid is the active
  token's, and every cloud gives the account a different one, so it cannot judge a target of a cloud
  that is not committed — hence the cloud's uid for a caller that names its cloud.
- **Compare every target against its cloud's uid**, including the app's. An app builds `join` ids
  from the session uid, so in a switch window its registration would be tagged with the incoming
  cloud's uid while carrying the outgoing one's id, survive the commit, and poll a stale id. Moving
  the app callers to a per-cloud uid is the change that makes them name their cloud.
- **Keep the frame guard as an assertion.** It asked about the scoped context, which names the slot's
  cloud by definition, so it could not catch the regression it was meant for — the graph itself
  following the selection.

## Consequences

- With the slots the binder binds today (the relay and the committed cloud), the steady state is
  unchanged: the committed cloud's targets run on its slot and write its partition. What changes is
  the switch:
    - a target registered for the incoming cloud waits for that cloud's slot instead of for the
      active pointer — the same moment in practice, since the binder moves the pointer as it binds;
    - the outgoing cloud's targets keep running on its slot until the slot is torn down, and a frame
      they receive in that window is written into the outgoing cloud's partition instead of dropped;
    - relay targets (a screen's grace entries, typically) keep running on the relay slot while a
      cloud is active, instead of being stopped by the active change. They leave through the grace
      window.
- `ISyncManager.register` and `updateLocalSnapshot` take an optional `{ cid }`; `listTargets`
  reports each target's cloud. Every app caller
  passes nothing and keeps the selected-cloud default. `createSyncPlans` takes the slot key instead
  of a `getBoundCid` accessor. `SyncManagerDeps.getUid` takes the cid; `getSessionUid` is new.
- `@chatic/data`'s `isCidActive` had only this caller and is removed. `@chatic/logger`'s
  `'sync-frame'` drop source has no producer left.
- The scoped graph is runtime-internal. A cloud-addressed send (the outbox, an upload's `chat.send`)
  is the next caller, and exposing it to apps is that change's decision.
