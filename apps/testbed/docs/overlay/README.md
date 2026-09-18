# overlay

**The one runtime inspector, reachable from every screen, without leaving it.** Session, socket, DB
and unread state all live behind one entry point instead of five ad hoc debug panels — open it from
chat home, the chat room, or settings, close it, and the current route and selection are exactly as
they were. It performs no sign-in itself; that only happens on
[the login screen](../session/login.md). Component: `apps/testbed/src/app/overlays/RuntimeOverlay.tsx`.

## Tabs

| Tab     | Shows                                                                                                          |
| ------- | -------------------------------------------------------------------------------------------------------------- |
| Status  | Session identity, the resolved `activeServer`, the raw relay and cloud contexts side by side, and socket state |
| DB      | [DB Browser](#db-browser) — read, write, delete and clear cached rows by type                                  |
| Perf    | Live sync targets, chat throughput/latency, cache-observation and render counts, socket connection quality     |
| Profile | The active cloud's name, the account-wide user profile (scoped to the active server), and the site profile     |
| Unread  | Unread totals — overall, by place, and by channel                                                              |

**Status is the one to check after any session action.** It shows the relay and cloud contexts
_independently_ (not just the resolved `activeServer`), which is the fastest way to tell "cloud
session actually cleared" from "cloud session is still there but `activeServer` already moved on" —
a distinction [session/README.md](../session/README.md)'s two logout actions can otherwise hide.

**Perf and Unread are read-only snapshots computed elsewhere** — `MetricsCollector` for Perf (see
[the app README](../../README.md#structure), which reports socket state changes into it
independent of whether the overlay is even open), and the same unread-aggregation hooks `apps/web`'s
home screen uses for Unread. Neither tab owns logic of its own; they exist to make numbers that are
otherwise invisible checkable in one place.

## DB Browser

A direct read/write panel over the cache layer — no separate debug-only storage, the same rows the
app itself reads.

### Types

Eight `CacheType`s, each mapped to the repository that actually serves it — note that `site` is
served by the **place** repository, not a `site` repository:

| Type          | Repository | Extra query filters                         |
| ------------- | ---------- | ------------------------------------------- |
| `channel`     | `.channel` | `sid`                                       |
| `chat`        | `.chat`    | `channelId` (required), `cursorNo`, `limit` |
| `user`        | `.user`    | `channelId` (required)                      |
| `join`        | `.join`    | `channelId`                                 |
| `site`        | `.place`   | none                                        |
| `invitecloud` | `.cloud`   | none                                        |
| `profile`     | `.profile` | `sid`                                       |
| `invite`      | `.invite`  | none                                        |

The row-count shown per type is a one-shot `cacheReadList` call, not a live subscription — it can
lag a change made elsewhere in the app by a moment. The query panel inside a type, once opened, _is_
live: it opens with an empty-query `observeList` subscription and re-subscribes whenever a filter
changes, so its results track the cache in real time.

### Actions per row/table

- **Delete** a row by id (`cacheDelete`) — reflected immediately, since the result view is the live
  subscription.
- **Write** a row from a JSON edit area (`cacheWrite`) — the same id overwrites, so this doubles as
  create and update.
- **Clear all** rows of a type, scoped to the current context (`cacheClear`) — destructive, gated by
  a confirmation dialog.
- One-click starter templates exist per type for quickly seeding a usable row without hand-typing
  JSON.

All of the above goes through `useRuntimeRepositories()` — there is no direct IndexedDB access
anywhere in this panel.

## Verifying

- A cloud switch on [chat home](../chat/README.md) should move the Status tab's `activeServer`,
  `Relay` and `Cloud` sections together and consistently.
- After a relay logout, the Cloud section should read `isActive: false` and cloud-scoped identifiers
  should clear.
- Deleting a DB row should remove it from the query panel without a manual refresh; Clear All should
  bring that type's row count to zero.
- DB writes/deletes here should never bleed into a screen's own state — they exercise the same
  cache the app reads, not a shadow copy of it.

## Related

- [../session/README.md](../session/README.md) — the actions this overlay only observes the results of
