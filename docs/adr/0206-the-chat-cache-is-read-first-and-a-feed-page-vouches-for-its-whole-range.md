# ADR-0206: The chat cache is read first, and a feed page vouches for its whole range

> Status: Accepted · Decided: 2026-10-15 · Implemented: `fix/chat-feed-gap-fill`
> · Scope: `libs/data/src/repositories/{ChatRepository.ts,feedCoverage.ts,ChannelRepository.ts}`
> · `libs/data/src/local/data-sources/ChatLocalDataSource.ts`
> · `apps/web/src/app/features/channels/{hooks/useChats.ts,hooks/useChatScroll.ts,hooks/useMessageJump.ts,components/GapDivider.tsx,pages/ChannelRoomPage.tsx,pages/ThreadPage.tsx}`
> · The module docs are [libs/data repositories](../../libs/data/docs/repositories/README.md#what-a-feed-page-proves)
> and [channels data layer](../../apps/web/docs/feature/channels/data-layer.md#gaps-cache-first-the-server-only-for-what-is-missing)

## Context

The chat cache can hold two runs of a conversation with history missing between them: rows scrolled
past last week, and the newest page fetched today. Nothing filled that stretch. Older-page paging
asks only below the oldest cached row, and stops altogether once row 1 is cached. A jump into the old
run (a search hit) landed, but the feed then showed the old run directly followed by today's messages
behind nothing but a date divider. A thread whose root sat in the stretch could never load it.

The cache cannot tell that stretch apart from a deleted message. The feed leaves soft-deleted rows
out, and a page writes only what it carries, so every deleted message also leaves a missing chat
number — in every room that has deletions. Marking every missing number as history to fetch would
put a divider at each one.

The server's feed answers a page by counting `limit` chat numbers down from the request cursor (or
the head, whichever is lower), looking each up, and leaving out only soft-deleted rows. It returns
the lowest number it counted, or 0 at the start of history. A page therefore proves a whole range
of numbers, not only the rows it carries.

## Decision

1. **A feed page vouches for its whole range.** `ChatRepository.refreshList` records the range each
   page answered for — exactly `[returned cursor, returned cursor + limit − 1]`, or from the start of
   history up to the newest row carried when it ran out — and `uncoveredFeed` reads it back. A missing
   number inside an answered range is a deleted message. One outside every answered range is history
   not fetched yet.
2. **The record lives in memory for the app run, and is cleared with the rows.** Every chat cache
   clear forgets the ranges of what it cleared.
3. **The screen reads the cache first and asks the server only for unanswered numbers.** Every cached
   row is shown at once. A run of more than 10 unanswered numbers between two shown rows gets a divider
   that, once on screen, fetches the page next to the reader and next to what is still unanswered.
   Older-page paging grows over a page this run already answered for without a request. An old cached
   block is fetched once per visit when the reader reaches it, to pick up what changed while the device
   was away. A thread root, or a jump target, in such a stretch is fetched by the page starting at it.
4. **A re-read page may mark a cached row it left out as deleted** (`markMissingHidden`). Only the
   fetches in (3) that re-read held history set it; the entry refresh and older-page paging do not. The
   row stays in the cache with `hidden` and `hiddenByFeed`; the cache undoes that mark when a server copy
   of the row arrives without saying it is hidden. A delete the server announced is never undone.

## Alternatives

- **Persist the answered ranges in the `meta` store.** It would save the first request per page of
  old history after a relaunch. It would also be a second record of the chat cache that must agree
  with it through every clear, cloud switch, storage-routing change and app update, with a native
  table behind it — and the relaunch request is the one that brings back edits made while away, which
  the re-check in (3) wants anyway.
- **Write a placeholder row for every number a page proved empty.** Holes would disappear for good,
  but the cache would carry rows the server never had; search, previews, unread counts and the reaction
  fold all read that cache and would each need to learn to skip them.
- **Render only the contiguous run around the newest message, hiding the old run until the gap is
  fetched.** Simple, but it throws away history the device already holds, and a search jump into the
  old run would have nothing to land on.
- **Fill the whole gap at once when it is found.** A gap can be thousands of numbers; one request per
  50 for history nobody looks at is not worth it. Filling next to the reader, one page at a time,
  spends requests only on what is being read.
- **Infer nothing about deletes.** Then a message deleted while the device was away stays visible and
  searchable for as long as it is cached, since live sync never replays the delete. The inferred mark is
  limited to re-read history and is reversible, so a wrong one costs one stale tombstone until the next
  page that carries the row.

## Consequences

- A gap the reader reaches is filled page by page from the side they came from. A block of old cached
  history costs one request per visit when first read, and none again in that run.
- Re-entering a room and scrolling back through what this run already fetched sends no request.
- A message deleted while the device was away is shown as deleted once the reader re-reads its block,
  and drops out of search then. History nobody re-reads keeps the old copy, as before.
- After a relaunch, holes in old cached history are unknown again until a page answers for them; the
  first look costs a request, and a hole of up to 10 numbers draws no divider meanwhile.
- `CacheChatView` gains the local-only `hiddenByFeed`; `ChatRepository` gains `uncoveredFeed`, and
  `refreshList` gains `markMissingHidden` and `cursorIsRow`.
- The thread page still draws no gap divider: replies further into a gap than the page after the root
  stay missing until history is fetched through them.

## References

- [ADR-0008](./0008-threads-client-derived-from-parentid.md) — threads are derived from the loaded
  window, which is why a root in a gap needed its own page
- [ADR-0067](./0067-rejoin-hides-prior-messages.md) — the join window, which bounds where a missing
  row may be read as deleted
- [ADR-0088](./0088-local-global-search.md) — search reads the cache, so a deleted row's words stay
  searchable until the cache learns of the delete
- [ADR-0176](./0176-a-room-entry-sends-one-feed-request-started-at-the-tap.md) — the entry refresh,
  which does not infer deletes
