# ADR-0193: State writes go local first and through an outbox

> Status: Accepted · Decided: 2026-10-13 · Implemented: `fix/chat-read-outbox`
> · Scope: `libs/data/src/outbox/` · `libs/data/src/repositories/JoinRepository.ts` · `libs/data/src/local/data-sources/JoinLocalDataSource.ts`
> · `libs/app-runtime/src/data/factories/outboxFactory.ts` · `libs/app-runtime/src/data/DataManager.ts`
> · `apps/web/src/app/features/channels/hooks/useReadMarker.ts` · `apps/desktop-web/src/app/shared/hooks/useReadReceipts.ts`
> · The module docs are [libs/data outbox](../../libs/data/docs/outbox/README.md),
> [libs/app-runtime data](../../libs/app-runtime/docs/data/README.md#the-state-outbox-transport) and
> [apps/web channels/data-layer.md](../../apps/web/docs/feature/channels/data-layer.md)

## Context

The channel list shows an unread count per room. After reading a room and coming back, the count often
stayed for a while before it went away.

The count is computed on the device from my read cursor in the local join cache, so it disappears the
moment that cache moves. The server was not the slow part: over the week to 2026-10-13 the iOS
`socket_request` trace put `chat.read` at 132 ms p50 and 384 ms p90, on about ten samples. The same
trace showed close to a third of all sampled foreground socket requests on iOS ending in 499
(in-flight requests rejected when the socket closed) or 503 (sent while it was down). Android had too
few samples to say.

The read path was bound to that socket:

1. The room waited for `isVerified` before marking, and the optimistic cache write lived inside the
   same call, so a room entered while the socket reconnected kept its count until the handshake ended.
2. A failed `chat.read` was rolled back. The room sent it again on the next reconnect, new message or
   return to the foreground, but the count was back until then, and a failure that left the socket up
   (a timeout, a 5xx) was not sent again at all.
3. The join cache took whatever cursor a write carried, so a join sync answer that left before the read
   and landed after it lowered the cursor again.
4. The room page stays mounted from one room to the next, and its dedup guard was not scoped to the
   room, so a room whose head was below the previous room's was never marked.

The read was one case of a wider pattern. "Show it now, tell the server later" was done five ways —
a repository's optimistic write with a rollback (notification setting, room name, reactions), an app
setting plus react-query (push mute), desktop-only stores, the chat outbox, and a first read queue —
and most rolled back on failure and never sent again. A first fix put a read queue in
`libs/app-runtime` behind `runtime.data.markChannelRead`; its review found screens that still called
`readChat` directly, which, with the rollback gone, left a failed read read on the device with nothing
resending it. A queue a screen can step around does not hold.

## Decision

1. **A state write goes two ways.** A write that sets one piece of state to a value — idempotent, only
   the latest value matters — is written to the local cache at once and handed to a state outbox, which
   sends it when the write's cloud can carry it. Today: my read cursor (`join.read`), my notification
   setting (`join.notify`) and my name for a room (`join.nick`).
2. **The repository owns it, so nothing can bypass it.** `JoinRepository.readChat` and `updateJoin`
   write locally, call the outbox and return a `WriteReceipt` once the local write is done; neither
   calls the socket. `receipt.delivered` settles when the server has the value.
3. **The outbox lives in `libs/data`, its timing in `libs/app-runtime`.** `libs/data/src/outbox/` holds
   the port repositories depend on, the machine and the state definitions — what is sent and how values
   combine. The connection's lifecycle stays the runtime's: `outboxFactory.ts` implements the transport
   (the cloud's own slot being verified, its scoped graph, holding the slot during a send, the uid in
   that cloud, what counts as a refusal, the retry schedule), and `DataManager` injects one outbox into
   every graph.
4. **Queued entries are data.** `{ op, cid, uid, key, value, previous? }`, sent through the named
   cloud's graph — never a closure, which would follow the selection when it finally runs.
5. **One value per key.** Values fold per `(cid, uid, op, key)` — the highest cursor, the latest
   setting — with one request per key in flight. A failure while the socket looks ready retries after
   2 s, 5 s and 15 s; otherwise the next ready transition is the retry. A 4xx other than 408, 429 or 499
   is final: the value is dropped, its receipt rejects, and the last accepted value (or the one the
   write replaced) is put back. A late answer is not recorded over a newer waiting value. A write from
   an account no longer signed in to its cloud is dropped.
6. **A cached read cursor never moves backwards**, and the room's dedup guard is per room.
7. **Every read and join write in both apps uses it** — the rooms, the thread page, bulk "mark all
   read", the home row's mute, the settings screen, the name dialogs, desktop's row menu and places page.

## Consequences

- The unread count clears as soon as the room is shown, including on a reconnecting socket, and a
  read, mute or rename made while offline reaches the server on the next reconnect without the user
  doing anything.
- `libs/data`'s design principle 2 ("there is no automatic dispatcher") now names one exception: state
  writes reach the server through the outbox, at a time the runtime decides.
- `readChat` and `updateJoin` return `WriteReceipt` instead of the server's join row. A screen reports a
  refusal from `delivered` and never waits on it to update; a name dialog closes at once and says so
  later if the server refuses.
- The local value can be ahead of the server for a while. Other devices, the server-side badge and
  other members' read receipts ("1") move only when the queued write lands.
- Right after a reconnect, a sync answer carrying the old value can show for a moment before the
  queued value lands. Accepted for now; the final state is right.
- The outbox is in memory. A write still queued when the app is killed survives only locally; the
  server hears of it on the next write to that key.
- `feat/channel-notify-mode` rewrites the settings screen's notification write; merging it means
  reading `delivered` instead of a rejected `updateJoin`.

## Alternatives

- **Compute the read before entering the room.** The only input is `channel.chatNo`, already known on
  entry; the delay was the socket, not the computation.
- **Keep the rollback and add retries.** The count reappears between the failure and the retry, which
  is the symptom; with a monotonic cursor the restore write is ignored anyway.
- **A runtime facade (`runtime.data.markChannelRead`) over a runtime queue.** The first iteration. It
  works for the screens that use it and not for any that call the repository, which is the bypass the
  review found.
- **One outbox for state writes and chat sends.** Their policies are opposite — idempotent latest value
  vs ordered, non-idempotent, one row per attempt — and a stuck send would hold reads behind it. They
  share a name, not a queue; the chat outbox can move under `outbox/` later with its own machine.
- **A new lib, or a new facade group.** The delivery methods and caches are `libs/data`'s and the
  timing is the runtime's; a third package would split one concern across three, and the runtime's
  public surface is locked to seven groups.
- **Folder names `writes/` or `sync-queue/`.** `writes/` reads as every write, and "sync" already
  means the server-to-device direction here.
- **Persist the outbox.** It would deliver a write after the app was killed, at the cost of a storage
  slot and writing the local value and the queue entry in one transaction. Left until a state needs it.
- **Push mute in the same change.** Its local value lives in `@chatic/config`, which `libs/data` does
  not depend on; it needs a local-write port and is left for a follow-up.
