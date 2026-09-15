# ADR-0057: Home last-message preview — one native query instead of per-channel window observation

> Status: Accepted · Decided: 2026-08-14

## Context

The per-row `useLastChat` hook in home's `ChannelList` subscribes each channel to the latest 30-row window
of the chat cache (`PREVIEW_LOOKBACK = 30`). Measured cost of this structure in the native (WebView)
environment:

- Every home entry costs, per channel N: **two `loadAll:chat` bridge round trips** (a prime limit of 50 +
  an observe limit of 30 — different payloads, so they cannot share an in-flight request) plus one
  `load:channel` call.
- Every room-to-home transition tears down the observer groups and sync targets and immediately rebuilds
  them, so the burst above repeats on every transition.
- Measured (2026-08-14 QA session): `loadAll:chat` called 568 times, average 2130ms, **max 15015ms (the
  bridge timeout ceiling)**. A first query that times out never calls its callback, so the preview stays
  stuck empty, and the same congestion pushed `useChannel`'s 10-second resolve timer past its limit,
  producing entry errors.

There is also a correctness bug: optimistically sent rows are stored with `chat_no = 0`, but the native
query is `ORDER BY chat_no DESC LIMIT n`, so **pending rows fall outside the query window** in any channel
where committed rows already fill the limit. The IndexedDB path's fix for this
(`ChatQueryExecutor.includeUnsent`) does not exist natively, and no caller uses it anyway.

The reason the preview is a 30-row window rather than "the latest one" is that the exclusion rules
(reaction events, thread replies, system rows and failed sends cannot be previews; tombstones can) lived
in JS (`pickPreviewChat`).

## Decision

### 1. Push preview semantics down into the query, and have home read the whole channel list in one bridge round trip

New bridge message **`FetchLastChatsData`** (chat-only): request is `channelIds[]`, response is per
channel `{ channelId, lastNo, item }`.

- `item` = the latest row that passes the preview rule. SQL predicate: `parentId IS NULL AND stereo <>
'system' AND subType <> 'reaction' AND NOT isFailed`. **Hidden (tombstone) rows are not excluded** — they
  must render as "This message was deleted."
- Pending rows (`chat_no = 0`, not failed) are **treated as the latest** (same semantics as
  `compareByChatNo`) — read via a separate probe from the committed top-1, and returned when present. This
  closes the existing D6 gap (window drop) on home.
- `lastNo` = the **type-agnostic maximum chatNo** for that channel's cache. It is the comparison baseline
  for the web's head-trigger (a small refresh limited to the channel whose polled `channel.chatNo` moved
  past it), so a channel whose latest row happens to be a reaction (and whose preview chatNo is therefore
  behind head) is not misjudged as short a message.

### 2. The web deploys before the app — an older-app fallback is not optional

The new capability is **not** layered onto `FetchAllCacheData` as a query option: an older app silently
ignores an option it does not know and answers with a wrong result (not an error, a wrong answer). As a
new message type, an older host rejects it with `NOT_FOUND`, so the failure is explicit.

- The web learns unsupport from a single `NOT_FOUND` (a module-scoped flag, following the precedent of
  `NativeDBAdapter.batchReadUnsupported`) and falls back to **today's behavior** (per-channel 30-row window
  plus JS `pickPreviewChat`).
- A native processing error responds with `items: null` (matching its sibling handlers) — the web falls
  back only for that single read (it does not learn from this).
- Since an older app has SQL semantics baked in that cannot be updated, the web re-validates each response
  row with its own `isPreviewableChat`; a row that fails falls back to a window read for that channel
  alone — the web owns the semantics, finally and singularly.
- The IndexedDB (plain browser) adapter does not implement this message — the fallback path is already the
  correct answer there (in-process, no round-trip cost, identical to today's behavior).

### 3. The preview semantics utilities move to `@chatic/data`

Move `compareByChatNo`/`isPreviewableChat`/`pickPreviewChat` (and their building blocks) to a
[`libs/data` domain utility](../../libs/data/src/domain/chatPreview.ts), and have `apps/web/utils/chat.ts`
re-export them. This lets the fallback path (data source) and web rendering share the same predicate. The
copy in `apps/desktop-web` is referenced only, not touched.

### 4. Remove home's per-row chat subscription

`ChannelList` moves to a single list-level `useLastChats(channels)`: a combined observation plus a
head-trigger small refresh (which only acts once the first result has arrived). Per-row `useChatSync`
registration/prime, and the N×`channel.get` catch-up it caused on reconnect, disappear from home.
`useLastChat` stays alive because `PlaceChannelManagePage` still uses it (a follow-up).

## Consequences

- Home's chat bridge round trips: **2+α per channel → 1 for the whole list**. The payload also shrinks
  from 30 rows × N to 1 row × N.
- A just-sent pending message shows up in the home preview before it is acked.
- Because the head-trigger compares against the "combined result already in hand," the initialization race
  (a refresh firing before `cachedMax` is populated) is structurally gone.
- The other half of the storm — per-navigation immediate polling and snapshot loss on sync targets
  (P0-2), immediate teardown of observer groups (P0-3), and `useChannel`'s 10-second timer (P1-2) — is out
  of this ADR's scope and remains a separate track.
- No performance improvement on older app builds (same path as today) — the app deployment has to catch up
  for the effect to land.

## Addendum (2026-08-15)

The head-trigger refresh from decision 4 has been **deleted**. Loading recent messages into the cache is
already managed separately, out of this track's scope (native background loading), so the list layer has
no reason to duplicate that work. `useLastChats` is now a pure cache observation, and the loading side's
writes re-emit the list through the `chats-last` re-limit — rendering the list never creates network
traffic under any circumstance.

## Addendum (2026-08-18) — home now explicitly owns the load

The "separately managed native background loading" the previous addendum assumed **did not actually
exist**. `apps/mobile`'s `ChatDataSource` is only reachable through bridge CRUD handlers, so chat cache
writes happen only when the web reads, and the browser (IndexedDB) has no such actor at all. As a result,
while sitting on home nothing was writing to the chat cache anymore — decision 4 removed the per-row
`useChatSync`, and the previous addendum removed the head-trigger — so the preview, and the ordering (which
ADR-0055 made follow preview time), froze until the user entered and left a room.

The same way `channel`/`join` do it, **home registers chat sync for the active site's channels**:
[`useChatSyncRegistration`](../../apps/web/src/app/hooks/useChatSyncRegistration.ts) (the chat-domain
sibling of `useJoinSyncRegistration`) is mounted by `HomePage`.

- **Target registration** — `registerChat(channelId)` per channel. A `chat.sync` frame is dispatched to
  every registered chat target and each target filters by its own `channelId`, so a message arriving on any
  channel in the site is appended live. Registration dedups by ref-count against the same key a room may
  register.
- **Head-trigger catch-up** — `ChatSyncPlan.run` is a no-op, so registration alone pulls nothing. Only
  channels whose polled `channel.chatNo` has moved past the cache's `lastNo` get a small page pulled. This
  is the safety net that guarantees convergence whether or not push arrives, and since it only fires for
  channels that actually moved, a warm list costs zero.
- **Baseline** — `updateLocalSnapshot` uses the `lastNo` from the combined observation the list already
  runs (`observeLastList`; the same set of channels means the same observer key, so reads are shared). Only
  `lastNo` is patched, so the message window of any open room is untouched.

The principle from the previous addendum — **rendering the list never creates network traffic** — still
holds. Catch-up lives in a sync-registration hook owned by the screen, not by a row, and `useLastChats`
stays a pure observation (a contract that `useLastChats.test.ts` continues to pin down).

## References

- Spec/architecture: docs/specs/cache/last-chat-preview.md (lived in the root docs tree, which has since
  been removed)
- Precedent: ADR-0053 (per-domain cache contract versioning), `FetchManyCacheData`'s NOT_FOUND learning
  fallback
- Underlying audit: the 2026-08-14 full review of home's request storm (the figures in this ADR's context)
