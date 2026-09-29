# ADR-0125: A cloud off screen keeps its lists current with one delta a minute

> Status: Accepted · Decided: 2026-09-29 · Implemented: `feat/background-cloud-receive`
> · Scope: `libs/app-runtime/src/socket/sync/BackgroundReceiver.ts` · `libs/app-runtime/src/socket/sync/runtime.ts` ·
> `libs/app-runtime/src/connection/hooks/useBackgroundReceive.ts` · `libs/data/src/repositories/SyncMetaRepository.ts` ·
> apps/web `useSocketWakeRecovery`
> · Builds on: [ADR-0118](./0118-a-sync-target-belongs-to-its-cloud-s-slot.md) (scoped repository graphs) ·
> [ADR-0119](./0119-every-joined-cloud-keeps-a-socket-session.md) (every joined cloud keeps a socket session)
> · The module doc is [libs/app-runtime/docs/sync](../../libs/app-runtime/docs/sync/README.md#background-receive)

## Context

Since ADR-0119 every cloud the account belongs to keeps a socket, but a socket that nobody asks
anything of keeps nothing current. Its screens are not mounted, so no sync target runs on it, and the
apps' own background sync polls only the cloud on screen. A cloud's cache therefore stopped at the
moment the user left it: its room list, each room's last message, and the read positions an unread
count is computed from. Showing another cloud's unread count from the cache — the next step — needs
that cache to move.

Three facts shaped the answer. `channel.sync {since}` spans a whole cloud and each room in its answer
carries its last message, its latest `chatNo` and this account's `$join`. The server pushes
`chat.sync` for new messages to connected members, though whether it does so for a member not looking
at the room is not confirmed. And the apps already poll the cloud on screen with this very delta,
once a minute, under the cursor `channel-sync:<cid>`.

## Decision

1. **Every bound slot that is not the active one runs a receive loop** — the background clouds, and
   the relay while a cloud is on screen. The active slot's loop does nothing: the app keeps that cloud
   current, as before. The rule is one rule rather than "background slots" plus a relay case, and the
   relay's room list needs keeping current for the same reason as any other cloud's.
2. **A loop asks for one thing: `channel.sync` since its cursor, through its cloud's scoped graph.**
   The rows and the cursor land in that cloud's partition, under the uid the account has there. The
   place list is re-read beside it every ten minutes and on the first delta, because a room is listed
   under its place. Nothing else is asked: no profiles, no per-room targets, no chat bodies.
3. **It asks when the slot verifies, every 60 seconds, 300 ms after a `chat.sync` push, 300 ms after
   the slot stops being active if it was never on screen and has not received for a full interval,
   and when the app says it returned to the foreground.** A cloud the user just left was kept current
   by the app, so its first tick counts from the moment it left. One delta runs at a time per cloud; a trigger that lands meanwhile folds into one
   more.
4. **The loop and the app share the cursor.** Both use `channel-sync:<cid>` in the cloud's own
   partition, so entering a cloud continues from its loop's last answer and leaving one continues from
   the app's.
5. **`SyncMetaRepository` names its graph's cloud and uid on every call.** The local data sources are
   shared by every graph and fall back to the selected cloud; a cursor written through cloud A's graph
   while B was selected landed in B's partition. This is the first caller that writes a cursor through
   a scoped graph, so the fix lands with it.
6. **The foreground trigger is one app-facing function, `sync.refreshBackgroundClouds()`.** The runtime
   has no foreground signal of its own. apps/web calls it from its wake kick; desktop-web does not,
   because its own background sync has no foreground trigger either.

## Alternatives

- **Register per-room sync targets on background slots.** The scheduler would keep every room of
  every joined cloud current, chat bodies included — at the price of a poll per room per cloud, which
  for a home screen with hundreds of rooms across six clouds is exactly the request volume the
  30-second grace window was built to avoid. A room list and an unread count need one cloud-wide delta.
- **Apply the `chat.sync` payload directly.** It is the message itself, so it could be written without a
  round trip. But it would mean running chat merge policy for rooms no screen has opened, and the
  delta carries the same last message and `chatNo` anyway. The push is used only as a signal.
- **Push only, no timer.** Unconfirmed on the backend side for a member not looking at the room; and a
  push says nothing about a room renamed, a member added, or a read on another device. The minute's
  delta is what guarantees convergence.
- **One timer for all clouds.** It would line every cloud's request up on the same tick and couple
  their failures and backoff. A loop per slot is born and dies with the slot.
- **Hand the loop's rows over by clearing and refetching on entry.** That is the cold fetch this
  removes; sharing the cursor makes the loop's work the app's head start.

## Consequences

- **A device sends one `channel.sync` a minute per cloud off screen**, up to six with the cap and the
  relay (plus any cloud held for a write in flight), plus at most one per burst of pushes and a
  `user.mysite` every ten minutes — and at boot, a delta and a place list from each at once. Before,
  it sent none for those clouds.
- A switch onto a cloud that has been receiving finds its list already cached, and its first delta is
  small. At the moment of a switch the loop's last delta and the app's first can overlap; both are
  idempotent, and the worst case is one repeated delta.
- How soon a message in a cloud off screen shows up depends on the backend: within 300 ms if the
  server pushes `chat.sync` to a background socket, within a minute if it does not. Measured on the
  dev servers for one account on two devices, it does not — each message arrived on the next tick,
  40–45 seconds after it was sent — while the same deltas did carry the `$join` the other device
  moved. Another member's message was not measured. The module doc keeps the record.
- `refreshBackgroundClouds` is a new public symbol (76 now).
- The channel leave guard lives on each repository graph, so a leave made through the app graph is not
  seen by a loop delta already in flight for that cloud; that delta can write the room back until the
  next one prunes it. The window is one request long and the guard is not shared.
- Unread counts for other clouds are still the push-mark dot; reading them from this cache is the
  next change.
