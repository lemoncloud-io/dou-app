# ADR-0122: A chat send is addressed to the cloud it was written in

> Status: Accepted · Decided: 2026-09-28 · Implemented: `feat/cloud-addressed-chat-send`
> · Scope: `libs/app-runtime/src/data/cloudChat.ts` · `libs/app-runtime/src/data/outbox.ts` ·
> `libs/app-runtime/src/socket/backgroundClouds.ts` · the apps' chat send, image send, retry and outbox
> wiring · the apps' sync registrations
> · Builds on: [ADR-0118](./0118-a-sync-target-belongs-to-its-cloud-s-slot.md) (scoped repository
> graphs) · [ADR-0119](./0119-every-joined-cloud-keeps-a-socket-session.md) (every joined cloud keeps
> a socket session) · [ADR-0121](./0121-an-image-send-runs-in-the-data-layer-over-a-put-port.md) (the
> image send sequence)
> · Amends: [ADR-0119](./0119-every-joined-cloud-keeps-a-socket-session.md) decision 1 — a cloud a
> write is in flight to keeps its slot outside the cap · decision 5 — going home does not sign off a
> cloud a write is in flight to
> · The module docs are [libs/app-runtime/docs/data](../../libs/app-runtime/docs/data/README.md#writes-addressed-to-a-cloud)
> and [docs/socket](../../libs/app-runtime/docs/socket/README.md#holding-a-slot-for-a-write)

## Context

ADR-0119 gave every joined cloud a socket, so a write meant for cloud A has somewhere to go while the
user is in cloud B. Nothing addressed anything there yet. Every chat send in both apps went through
the app repository graph, and that graph decides a send's cloud twice:

- **the cache partition** of the optimistic row, when the call starts: the selected cloud with the
  session's uid;
- **the socket**, when the request goes out, after the optimistic row has been written: whichever slot
  is active by then.

A switch landing between the two put the row in A and the message on B's socket. A switch pressed in
its optimistic window — the selection already on B, the session and the active slot still on A —
wrote the row under B's cloud id with A's uid, and sent on A. `sendChat` never asks `acceptsAnswer`,
so nothing refused either. When A then fell out of the background selection (past the cap, or not in
the app's list), the binder destroyed its client and the in-flight request died with a 499.

The image send ADR-0121 introduced has the same shape and a far wider window: a pending row, then
uploads that take seconds, then the send — each on the app graph, each reading the selection when it
runs.

Desktop's offline outbox had the same problem one level up. Its entries carried no cloud, its sweep
read only the selected cloud's partition, and it was rebuilt on every switch because it depended on
the session uid. A message that failed in A was either never resent, or resent through B's socket,
and a switch discarded whatever was queued.

The apps' sync registrations had a related flaw. They registered with no cloud, so the registry
tagged them with the session uid, and several built join ids as `<channel>@<session uid>`. Every cloud
gives the account a different uid, so in a switch window those ids named the wrong member. The only
thing that kept them from being polled was that the session tag retired them at commit.

## Decision

1. **A write names its cloud when the user acts, and everything it does is that cloud's.**
   `data.runInCloud(cid, work)` runs `work` against `getScopedRepositories(cid)`;
   `data.sendChatInCloud(cid, payload)` is the text send on top of it, and the image send runs its
   upload and send inside one `runInCloud`. The cloud is the one the row on screen belongs to: the
   channel row's `cid` for a new message, the failed message's own `cid` for a retry or a discard.
   Its partition, the uid it stamps and its socket are therefore all that cloud's, and nothing reads
   the selection after the press.
2. **The write holds its cloud's socket slot until it settles.** `backgroundClouds.hold(cid)` keeps a
   bound slot in the background selection whatever the cap and the joined list say, added after the
   capped set rather than taking a place in it. It opens no slot: a cloud without one fails the
   write's first socket call at once. The hold is reference-counted, taken before the work awaits
   anything, and released on settle, success or failure. While a cloud is held, going home does not
   sign its socket off.
3. **The outbox works across clouds and never opens a socket.** Entries carry `cid`, queues are keyed
   by `(cid, channelId)`, and readiness is per cloud (`setReady(cid, ready)`). Desktop builds one
   instance per relay account and sweeps every cloud whose slot is verified
   (`connection.useVerifiedClouds`), reading that cloud's partition. Its sends go through
   `sendChatInCloud` like any other. A cloud without a verified slot keeps its failed rows until it
   has one.
4. **App sync registrations name their cloud and build ids from that cloud's uid.** The shorthand
   `register*` methods take `{ cid }`. `session.useUidInCloud(cid)` / `getUidInCloud` give the uid,
   and `connection.useCloudVerified(cid)` gates the work on that cloud's own slot. A baseline pushed
   with `updateLocalSnapshot` carries the cloud its cache was read in, not the one selected after the
   `await`. The rooms recognise "me" by the uid in the room's cloud.

## Alternatives

- **Publish the scoped graph and let each caller take the hold.** It is the smaller surface, but a
  hold is exactly what a caller forgets, and forgetting it passes every test that does not also
  switch. Putting it inside the one function that runs the write makes it impossible to skip.
- **Hold for a grace period after the write settles (say, 30 seconds).** The ack is the last thing a
  send needs the socket for; the cache writes after it are local. A grace would spare a reconnect
  only when a user sends again to a cloud outside the cap within the window, and it adds a timer per
  cloud whose only visible effect is a socket that stays open longer than it has reason to.
- **Let a hold open a slot for a cloud that has none.** The write that took the hold goes out at
  once, so the slot would arrive after the write had already failed — a token exchange and a
  connection for nothing, torn down again as the hold ended.
- **Wait for an unbound cloud's slot before sending.** At the moment of a press, the cloud on screen
  has a slot, so an unbound one means the session is not ready. A failed row the user can retry says
  so; a message left pending on a slot that may never come does not.
- **Address the write to the selected cloud.** The selection moves before the session and the active
  slot, so during a switch it names the cloud the user is going to, not the one they pressed send in.
  That is the window this decision exists to close.
- **Let the outbox hold clouds so it can resend to them.** It would open a socket past the cap just to
  resend, on every reconnect, for a cloud the user is not in. The message waits in its own cloud's
  partition, and the user entering that cloud is what brings its socket back.
- **Put the hold in `ChatRepository`.** `libs/data` knows nothing about socket slots, and the
  repository already receives a socket client that resolves its slot per call. The hold is a runtime
  concern, and it sits where the runtime turns a cloud id into that client.
- **Move reactions, edits, server deletes and read markers in the same change.** They have the same
  shape of problem and the same fix, but none of them loses a message the user wrote. They are left on
  the app graph and named as the next step.

## Consequences

- A send pressed in A and followed by a switch to B arrives in A, and its row stays in A's partition.
  A scenario test drives this through the real manager, binder and background selection; its control
  case shows the same switch tearing A down under a send made without the hold.
- A cloud outside the cap, or not in the app's list, can keep its socket for the length of a write.
  Neither the cap nor the list bounds that; the number of writes in flight does.
- A held cloud that is no longer in the app's list is never told `auth.logout` when the user goes
  home: the logout is skipped for the hold, and the binder signs off only joined clouds when the hold
  ends. Closing the socket is what ends that session.
- A write to a cloud with no bound slot fails at once and leaves a retryable row, where the app graph
  would have sent it through whichever slot was active.
- apps/web's retry now carries the failed message's `parentId` and `contentType`, and refuses an empty
  row before deleting it. Today only the room offers a retry and the room shows no replies, so the
  first is latent until a thread retries too.
- Desktop's outbox keeps its queue across switches, and a failed message in a cloud past the cap is
  resent only once the user is back in that cloud.
- The public surface gains `data.runInCloud`, `data.sendChatInCloud`, `data.getCloudRepositories`,
  `session.getUidInCloud`, `session.useUidInCloud`, `connection.useCloudVerified` and
  `connection.useVerifiedClouds`. `OutboxEntry` and `OutboxEnqueueInput` gain a required `cid`,
  `ChatOutboxOptions.send` is addressed to `entry.cid`, `createChatOutbox`'s `setReady` and `pending`
  take a cloud, and the `ISyncManager.register*` shorthands take an `options` argument. The
  `@chatic/logger` `'sync-frame'` drop label, which had no producer left, is removed.
