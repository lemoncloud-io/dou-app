# ADR-0058: Remove screen-transition churn — sync grace period, observer grace preservation, channel seeding

> Status: Accepted · Decided: 2026-08-15

## Context

The 2026-08-14 audit of home's request storm found that [ADR-0057](0057-home-last-chat-preview-single-query.md)
(home preview single query) removed the single largest contributor to the storm. The other half was the
structure itself: **screen transitions tore down every subscription and sync target and immediately
rebuilt them.**

1. **Sync targets**: `SyncManager.unregister` calls `stopSync` immediately once refs hit zero, and the
   scheduler's `stop` **discards the snapshot along with the target**. Re-registration triggers `start()`'s
   `scheduleNow(0)`, an **immediate poll**, and with no snapshot the first response is **unconditionally
   judged "changed,"** producing a cache-write → re-limit → re-fetch chain. Every room-to-home cycle
   repeated this for N channel targets plus N join targets (`save:channel` 228 times, `save:join` 632
   times).
2. **Observer groups**: `BaseLocalDataSource.registerObserver` deletes a group (and its cached value)
   immediately once the last subscriber leaves, so every subscription on a re-entered screen re-read from
   storage — and on native, one read is one bridge round trip.
3. **Entry errors**: `useChannel`'s 10-second resolve timer expired before congestion-related bridge queue
   delays (observed up to 15 seconds), producing an error screen **even though the channel was sitting
   fine in cache.**

## Decision

### 1. A 30-second grace period on sync target unregister (`UNREGISTER_GRACE_MS`)

When refs hit zero, do not stop immediately — start a delay timer. Re-registration within the grace
period **joins the still-alive target** through `register`'s existing merge path — no immediate poll, and
no unconditional write from snapshot loss.

- Polling during the grace period keeps its idle backoff (up to 60 seconds), so the residual cost is one
  or two requests per target.
- **Grace entries are purged on active client swap.** Carrying them over would let re-registration fall
  into the merge path and either never call `startSync` on the new client, or resume polling a departed
  screen's target on the new socket — both wrong.
- Polling for a channel the user left (lost membership) can live up to 30 seconds longer, but the existing
  403/404-twice → `gone` auto-stop path still closes it.

### 2. Observer group grace preservation + write invalidation (`RETIRED_GROUP_TTL_MS` 60 seconds, capped at 256)

Keep a group, with its value, for 60 seconds after its last subscriber leaves. A re-subscription within
the grace period gets the group's value immediately instead of hitting storage (the same `hasValue`
branch as a first subscription).

**A stale value is structurally impossible**: if a write touching a grace-preserved group hits the flush,
the group is **discarded entirely** instead of being re-fetched — re-fetching for no listener is wasted
work, and leaving the old value in place would be wrong. So any value revived from grace is always "what
the last subscriber saw, with no write since." No stale-while-revalidate layer is needed: invalidate-and-
delete gives freshness for free, and a revalidation machine only adds complexity.

### 3. Home row → room channel seeding (display only)

`ChannelItem` passes its own channel row via navigation state (following the precedent of `openThread`
passing `rootChat`), and `useChannel` receives it as `seed` to fill **the display before the observation
resolves**. With a seed present, the 10-second resolve timer no longer falls through to the error screen
(replacing content that is already on screen with an error is worse than the timer's original purpose).

Seeding does not touch resolution semantics: `hasResolvedRef` remains owned by the observer, so the first
`null` from a cold cache still means "fetch in progress" (preventing a regression to home-bounce from
misreading absence), and a **resolved removal** (a row that existed and then disappeared) still beats the
seed, so the caller's leave-handling still runs.

### 4. `PlaceChannelManagePage` also moves to list-level `useLastChats`, `useLastChat` is retired

The last consumer of the per-row subscription is gone, so the hook was deleted. Preview-predicate unit
test cases moved to `libs/data`'s `chatPreview.test.ts`.

## Consequences

- Room-to-home cycle: immediate polling fires 2N → 0, snapshot-loss writes 2N → 0, most re-entry bridge
  re-fetches → a group cache hit. The entry error screen disappears on entries that carry a seed.
- Cost of the grace periods: target polling can persist for ≤30 seconds and group values for ≤60 seconds
  (only absent a write) after a screen is fully left — a deliberate, constant cost against the measured
  storm.
- `SyncManager`/`BaseLocalDataSource`'s contract tests were updated for the new semantics ("dispose stops
  after a grace period," "re-subscription gets the grace value immediately").

## References

- [ADR-0057](0057-home-last-chat-preview-single-query.md) — home preview single query (together with this
  ADR, closes all of the audit's P0 items)
- Spec: docs/specs/cache/last-chat-preview.md (lived in the root docs tree, which has since been removed)
