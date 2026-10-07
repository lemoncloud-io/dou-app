# ADR-0176: A room entry sends one feed request, started at the tap

> Status: Accepted · Decided: 2026-10-02 · Implemented: `feat/room-entry-speed`
> · Scope: `libs/app-runtime/src/socket/sync/{roomFeed.ts,hooks/useSyncTarget.ts}`
> · `apps/web/src/app/features/channels/hooks/useForegroundChatRefresh.ts`
> · `apps/web/src/app/features/home/components/ChannelList.tsx` · `apps/web/src/app/routes/{routeChunks.ts,PrivateRoutes.tsx}`
> · The module docs are [sync/README.md](../../libs/app-runtime/docs/sync/README.md#one-fetch-per-room-entry)
> and [performance.md](../../apps/web/docs/observability/performance.md#chat_room_sync)

## Context

Opening a room fetches its latest page (`chat.feed`) once. Which code sends it depended on the cache:
the cold prime (`usePrimeChat`, app-runtime) fetched only a room the cache did not hold, and the warm
entry refresh (`useForegroundChatRefresh`, web) fetched only one it did. That rule — every entry
fetches exactly once — lived in the module docs and the hooks' comments, not in an ADR.

Both hooks run inside the room page, after it mounts and after a cache read. The `chat_room_sync`
trace on iOS (one week of internal-tester data) put the tap-to-mount gap at about 360ms at p90 and up
to 1.1s, and the request did not leave until after it. On top of that, the first room of a session
waited for its route chunk over the network before it could mount; that open was the slowest
measured.

## Decision

1. **The room's fetch goes through one function, `fetchRoomFeed(cid, channelId)`.** A caller that
   finds the room's fetch in flight, or one that finished in the last two seconds, gets its result
   instead of sending another request. A failed fetch is forgotten at once. The prime and the warm
   refresh both call it; the cold/warm split of who asks stays as it was.
2. **The home list's row tap starts that fetch** (`prefetchRoomFeed`), when the room's cloud socket is
   already verified. The request is out while the page transition runs and the room mounts, and the
   hook that applies joins it. In a browser run the request left 0–1ms after the tap, against 48–88ms
   (373ms for a session's first room) without it.
3. **The tap registers the room's chat target before the request.** A `chat.sync` push reaches only
   registered targets, so without it a message sent between the fetch's answer and the room's own
   registration would be dropped. It disposes at once; the target stays live through its 30-second
   unregister grace, and the room's registration joins it.
4. **The refresh on a foreground return always sends** (`fresh`). A fetch still in flight may have
   been sent before the app was suspended and answer with a page from before the pushes it missed.
5. **The private shell preloads the room route chunk once the app is idle**, or two seconds after it
   mounts where there is no idle callback (the iOS WKWebView). The home list does not load it itself:
   features do not reach each other.
6. **The fetch that starts owns the room's `chat_room_sync` trace**, as before. A new room entry that
   no fetch has taken — a second tap on the same room while its first fetch is out — takes the fetch
   it waits on, and a new entry is never answered by a fetch that finished before it began.

## Alternatives

- **A react-query prefetch keyed by room.** The page is not query state: the room reads the cache
  through its observers, and the fetch's job is the cache write. A query cache would hold a second
  copy of a result nobody reads, and app-runtime's prime has no query client.
- **Start the prime earlier instead of adding a shared fetch.** The prime is a hook inside the room
  page; starting it earlier means mounting the room earlier, which is the wait itself. And the warm
  path lives in the web, so the tap needs a function both sides call anyway.
- **No reuse after a fetch finishes, only while it is in flight.** On a fast server the tap's fetch
  can finish before the room's hooks ask, and they would send the same request again — the very
  double fetch the old rule existed to prevent. Two seconds covers the mount on a slow device.
- **A longer reuse window.** A room re-entered or re-verified within the window is answered by the
  last page instead of a new one. Live pushes and the reconnect catch-up still cover it, but the
  window is kept short so a page older than the room entry it answers stays rare.
- **Parallelise a push's cloud token exchange with the socket handshake wait.** Considered with this
  change and left out: a token exchange before the handshake on a cold start is known to race the
  connection and fail, and a failed shared exchange would fail the switch. It would save 0.2–0.4s.

## Consequences

- A list entry sends its `chat.feed` at the tap. `feed_sent` on `chat_room_sync` now lands ahead of
  `mount` for `entry` `list`, so the trace's before/after comparison is on that entry only; push and
  deep-link entries still fetch after the room mounts.
- A re-verification or re-entry within two seconds of a finished fetch gets that page instead of a
  new one. The foreground return is excluded, since closing the missed-push gap is its job.
- A tap registers a chat target even if the room is then never opened; it is stopped after the
  30-second grace.
- The room route chunk is fetched in every session that reaches the private shell, opened or not.
- `runtime.sync` gains `fetchRoomFeed` and `prefetchRoomFeed` (81 value exports).

## References

- [ADR-0118](./0118-a-sync-target-belongs-to-its-cloud-s-slot.md) — the per-cloud slot the fetch and the
  tap's gate are keyed by
- [ADR-0120](./0120-performance-traces-move-to-firebase-performance.md) — the traces that measured this
- [ADR-0046](./0046-web-feature-ownership-and-barrel-hygiene.md) — features do not import each other
