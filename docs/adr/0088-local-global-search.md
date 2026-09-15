# ADR-0033: Global search over the local cache (places, channels, clouds, messages, plus message jump)

> Status: Accepted · Decided: 2026-07-29 · Updated: 2026-08-06 (search narrowed to the active cloud, the place switch settled, context lookup added)

## Context

apps/web has no search. The header's search button is wired up to a placeholder — `HomePage.handleSearch`
raises a "coming soon" toast (see ADR-0013).

The requirements:

- **Local search** — scan the local cache (IndexedDB) with no network search API.
- **Results emitted live as the keyword changes** — every input change refreshes them.
- **Recent-search CRUD** — save, show, delete one, delete all.
- **Global place and channel search** — clicking a result goes to that place or channel.
- **Chat message search plus jump** — clicking a result moves place → channel → the cursor on that
  message.

### The constraints the survey found

1. **"Every cloud at once" and "local" are only partly compatible.** The sync layer syncs the active
   cloud only (`SyncManager.isCidActive`, `dropForeignFrame`), and the socket attaches to a single active
   cloud's wss. Content from a cloud never visited does not exist locally, and data from a cloud visited
   in the past lingers stale. → **Only what is in the local DB is searchable, and what is absent is
   accepted as unsearchable** (the user's decision).
2. **The current read path queries the active cid partition only.** The IndexedDB key is
   `${type}:${cid}:${uid}:${id}`, and a query pins the global `DataContextHolder`'s active cid
   (`TYPE_CID_UID_INDEX`). A repository's `ctxOverride` affects observer keys only and does not reach
   down to selecting the storage partition. But the index is the composite `['type','cid','uid']`, so
   **adding a cross-partition read as an IDBKeyRange scan pinned on type alone is a small, read-only
   extension**.
3. **The native global search path already exists (only the web-side caller is missing).** The bridge
   message `SearchGlobalCacheData { keyword, cid?, uid? }` → `useSearchCacheHandler` →
   `CacheSearchService.search` → a SQLite `LIKE` query is implemented end to end. **With cid omitted it
   searches every cloud partition**, and the matching rules are `name LIKE %kw%` for channels and sites
   (places) and `content LIKE %kw%` for chats. The ordinary CRUD path, `NativeDBAdapter.loadAll`, names
   the active cid explicitly and so cannot be used for a cross-partition read.
4. **The server's `chat.feed` supports a backwards cursor only** (a `cursorNo` upper bound, with no
   anchored bidirectional fetch). Jumping to an arbitrary chatNo is possible only by "loading older pages
   repeatedly until the target appears".
5. **desktop-web has reusable assets**: `features/search`'s `useMessageSearch` (a local cache scan,
   debounced 300ms, a two-character minimum) and the jump implementation in `useMessageJumpStore` plus
   `MessageList` (a backwards paging budget, `MAX_JUMP_PAGES`, with a `data-chat-no` scroll and a
   highlight).

## Decision

### In scope

1. **A dedicated search page** — a new `/search` route in apps/web (under UnifiedLayout), entered from
   `AppHeader onSearch`. A full page, not a modal.
2. **What is searched = the active cloud's local cache** (the same for web IndexedDB and native SQLite):
    - Places, channels and chat messages — **whatever is cached in the active cloud's partition**.
    - **The draft's "every partition, whatever the cloud" is withdrawn** (2026-08-06). The cache is
      partitioned by `(cid, uid)` and `uid` derives from **the active session token**
      (`contextStore.ts:45-47`) — a row in some cloud was written under that cloud session's uid, so from
      relay or another cloud's session the uid filter hides it. "Search every partition" was therefore an
      unpredictable subset that changed with the session (it showed up in real use as other clouds'
      results vanishing after switching to relay). One cloud at a time expresses the searchable range
      honestly.
    - The storage contract (`IGlobalCacheSearchSource`) keeps its cross-partition scanning ability — the
      caller simply names a `cid`. Making the uid axis session-independent (forcing a global partition the
      way `invitecloud` does, `storages/utils.ts:66`) is left as a separate decision.
    - Cloud names — the relay catalogue (`useCloudSessionCatalog`) plus the invited cloud cache
      (`useInvitedClouds`) plus names from the local cloud cache (`useCachedCloudNames`). Cached names
      win, and this source fills the gap when a cloud session drops, since the catalogue is a REST read
      that depends on auth and the network. **Name search is not limited to the active cloud** — it is a
      list filter rather than a cache scan, and it is the only way across to another cloud.
    - Data that is not local (content from unvisited clouds, older messages outside the cache) is
      explicitly accepted as unsearchable.
3. **One search contract, two adapter implementations (identical behaviour required)** — define a global
   search contract in the storage layer (`searchGlobalCache(keyword, { cid?, uid })`, returning results
   per domain) and have the web and native adapters implement **the same expected logic**. The existing
   repository `observeList` / `cacheReadList` paths are untouched.
    - **Native (WebView)**: use the existing `SearchGlobalCacheData` bridge message as it is (cid omitted
      = every cloud, SQLite `LIKE`). In principle no new native work is needed.
    - **Web (IndexedDB)**: add a read-only API to `IIndexedDB` / `IndexedDBAdapter` that scans with type
      pinned and cid ranged, and implement the same matching semantics as native on top of it — the name
      for channels and places, the body (content) for chats, case-insensitive substring matching, every
      partition when cid is omitted, and the uid filter.
    - **Guaranteeing sameness**: write a shared contract test (the same fixtures against both adapters)
      so the two implementations return the same result shape for the same input, and keep it from
      regressing.
    - Carry each result row's `cid` in the result model, as the material for switching clouds.
    - **This source also handles context lookup** (added 2026-08-06). Showing a result row's place and
      channel names, unread count and last message needs cache rows outside the result row itself, but the
      repository's context override is an sid override rather than a cid override and so cannot be used
      (`ChannelLocalDataSource.ts:39,53`). So `resolveContext` lives on the search source and always takes
      the cid as an explicit argument — temporarily mutating the shared `DataContextHolder` is forbidden on
      the evidence of past cross-cloud contamination incidents. **Rendering search results therefore uses
      no repository and no sync hook at all.** The contract and its reasoning are developed in
      global-cache-search.
4. **Live emission** — rescan when the keyword input settles (debounced 300ms, a two-character minimum).
   No new stream machinery such as RxJS (the repo's established patterns stay).
   The draft item "merge live updates for the active cloud's places and channels through an `observeList`
   subscription" is **withdrawn** (2026-08-06) — a repository subscription sees only the active cloud's
   partition, so only part of the results would stay live, which breaks consistency rather than helping,
   and it contradicts point 3's "rendering search results uses no repository and no sync hook". Results
   are a cache snapshot as of the search.
5. **Recent searches** — the `usePreferenceStore` pattern (zustand plus localStorage plus the native
   bridge `savePreference` sync, with a key added to `preferenceKeys`). Saved on submit, deduplicated as an
   LRU of at most 10, with delete-one and delete-all.
6. **Navigating from a result**:
    - A result in the active cloud and active place → `navigate(ROUTES...)` directly.
    - Anything else → reuse the `usePushNavigate` pattern: `waitUntilVerified` → `switchCloud(cid)` →
      **wait for the new cloud socket to re-verify** → `switchSite(sid)` → navigate.
    - **Switching the place (sid) is required, not optional** (settled 2026-08-06). The first
      implementation narrowed this to "the target page loads from the URL id, so switching cid is enough",
      but a place result's destination is home, and home is drawn from the session's `selectedSiteId`
      rather than the URL (`HomePage.tsx:65,184`). The requirement that backing out of a channel leaves
      you on its place's home leads to the same conclusion. The means is `useSiteSwitch` (the socket
      `auth.switch`) which app-runtime exposes; web-core's token refresh path (`switchSiteSession`) is not
      used.
7. **Message search plus jump** (all of it in scope):
    - Port desktop-web's `useMessageJumpStore` plus the `MessageList` jump logic into apps/web.
    - Add a `/channels/:id/room?chatNo=` query parameter, parsed by the room page and handed to the jump
      store.
    - Have `useChats` cooperate with repeated backwards loading (a `loadMore` budget loop). The
      `data-chat-no` scroll and the highlight are owned by a separate hook (`useMessageJump`) rather than
      `useChatScroll`, whose only job is to stop the automatic scroll to the bottom while a jump is pending
      — with two scroll owners alive at once, pinning to the bottom always wins (message-jump).
    - **Fallback**: if the target is not reached within the page budget (the equivalent of
      `MAX_JUMP_PAGES`), go to the channel's latest position and raise an explanatory toast.

### Out of scope

- A server-side search API (cross-cloud server search, an anchored-feed extension) — not pursued.
- An independent data stack per cloud (syncing several contexts at once) — a huge job, not done.
- Searching the entire message history — only what is in the local cache.

## Alternatives

- **A server-side cross-cloud search API** — it would make search genuinely unified, but it abandons the
  "local" premise and ties the work to the backend's schedule. Rejected.
- **A new independent data stack per cloud** — a huge job that inverts the single `DataContextHolder`
  architecture. Far too much for search alone. Rejected.
- **Limit the scope to the active cloud** — simplest, but it falls short of "global search". Rejected
  once a cross-partition read proved to be a small extension.
- **A search dialog (modal) UI** — desktop-web's approach. apps/web settled on a dedicated page (the
  user's choice). Rejected.
- **Bidirectional jump through a server anchored-feed extension** — tied to the backend's schedule.
  Backwards paging plus the fallback is enough (message search itself scans the recent cache, so a target
  far in the past is unlikely). Rejected.
- **Store recent searches with a `useLocalStorage` hook** — lighter, but with no native bridge sync it is
  lost when the WebView cache is cleared. The `usePreferenceStore` pattern wins.

## Consequences

**What is gained**

- Instant search with no network or backend dependency. It works offline.
- The active cloud's places, channels and messages are searchable immediately without the network. Other
  clouds are found by name, switched to, and then searched (so results do not change with the session).
- Reusing desktop-web's assets cuts the cost of message search and jump, and converges the two apps'
  search behaviour.
- The cross-partition read is a new read-only path, so existing cache and sync behaviour is unaffected.

**Trade-offs accepted**

- **Result freshness is not guaranteed** — even for the active cloud, the cache is a snapshot as of the
  last sync. A renamed or deleted channel can appear in the results (handled as a failed entry).
- **Other clouds are not searched at once** — a cloud has to be switched to before it is searchable. The
  uid partitioning in point 2 is the root cause, and resolving it means changing the cache scope itself.
- **Message search covers only the cached recent range** — it is not a full history search, and the UI
  has to convey that limit without misleading anyone.
- **The jump depends on the backwards paging budget** — exceeding it falls back (jump to the latest plus a
  toast), so the target is not always reached.
- **The cost of maintaining two implementations** — the search semantics (which fields, the substring
  rule, the scan cap) exist in both the web IndexedDB implementation and the native SQLite one. The shared
  contract test enforces sameness, but a change to the semantics always has to be made twice.
- Scanning a whole chat partition gets expensive as data accumulates, so the scan caps (per channel and
  overall, as desktop-web does) have to stay, applied identically in both adapters.

## References

**The spec documents that implemented this decision** (the standard for current behaviour — this ADR
holds only the "why"). They lived in the root docs tree, which has since been removed:

- global-cache-search — the cross-cloud cache read contract (`search` / `resolveContext`), both
  implementations and the shared contract test
- web-search-page — the `/search` screen, the result row display model, switching cloud and place
- message-jump — the `?chatNo=` cursor move and its exclusivity with pinning to the bottom

- Entry point: `apps/web/src/app/features/home/pages/HomePage.tsx` (the `handleSearch` placeholder)
- Reference implementation: `apps/desktop-web/src/app/features/search/*`,
  `apps/desktop-web/src/app/shared/stores/useMessageJumpStore.ts`
- Storage: `libs/data/src/local/databases/IndexedDBDatabase.ts` (`TYPE_CID_UID_INDEX`),
  `libs/data/src/local/storages/IndexedDBAdapter.ts`, `NativeDBAdapter.ts`
- The existing native global search path: `libs/app-messages/src/types/model/cache.ts`
  (`SearchGlobalCacheDataPayload`), `apps/mobile/src/app/webview/hooks/useSearchCacheHandler.ts`,
  `apps/mobile/src/app/services/cache/CacheSearchService.ts`,
  `apps/mobile/src/app/data/cache/ChannelDataSource.ts` (an optional-cid `fetchAll` plus `LIKE` matching,
  with Chat and Site the same shape)
- The cross-cloud navigation pattern: `apps/web/src/app/bridge/navigation/usePushNavigate.ts`
- The recent-search storage pattern: `apps/web/src/app/stores/usePreferenceStore.ts`
