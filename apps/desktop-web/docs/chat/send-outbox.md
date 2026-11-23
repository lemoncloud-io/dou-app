# Sending, retrying and the outbox

Sends go through the engine's chat repository, which inserts the optimistic row and dispatches over
the socket. The hooks are in `src/app/shared/hooks/` (`useChatMutations`, `useChatOutbox`).

## Writes name their cloud

Send, retry and discard are addressed to the cloud the caller names (the channel's own), not to
whichever cloud is selected when the write lands. The app's repository graph resolves its partition
and its socket at different moments, so a cloud switch between the two put the optimistic row in one
cloud and the message on another cloud's socket. The cloud is captured when the person presses send.

- Sends are not serialized: the optimistic row is the feedback, and a slow ack must not hold up the
  next message. Per-message state (`isPending`, `isFailed`) lives on the rows.
- **Retry** deletes the failed row first, awaited, then sends the content fresh. If the delete fails the
  resend stops and the failed row keeps its retry button; sending anyway would leave two rows for one
  message. It builds the same payload as the automatic resend, including `contentType`: a retry that
  dropped it re-sent a non-text message as plain text.
- **Discard** deletes the local row. A failed row exists only in the local cache, so that is the whole
  delete. It also retires any queued outbox entry for the row.

## The automatic resend

`useChatOutbox` is a desktop opt-in (`apps/web` never calls it and stays manual-only): a message that
failed to send goes out on its own once the socket of the cloud it was written in verifies again.

- **Every joined cloud, not the selected one.** A failed row belongs to its cloud's partition and its
  channel id means nothing elsewhere, so each queue entry carries its cloud and its probe, delete and
  resend use that cloud's own repository graph and socket slot. One instance lives for the whole relay
  account, so a cloud switch neither drops the queue nor aims it at another partition. It is rebuilt
  only when the relay uid changes: the session uid flips to each cloud's own uid at every switch, and
  keying on it rebuilt the machine and threw the queue away on every switch.
- **It never opens a socket.** It sends only to a cloud whose slot is bound and verified now. A cloud
  without one keeps its failed rows and their retry button until something else gives it a slot, and
  its sweep runs the moment it does. Verification is the trigger because it follows the reconnect
  handshake, the closest signal that the chat catch-up is live.
- **Entries come from a cache sweep, not from the send path.** `sendChat` rejects with the raw error
  and never exposes the optimistic row's id, so a rejection hook would have no row to delete or
  discard. The sweep reads failed rows back out of the cache, which also recovers messages that failed
  in an earlier app session.
- **One attempt per ready transition.** The sweep runs on the rising edge of a cloud's verification.
  That keeps at most one failed row per undelivered message; the next sweep re-reads whatever is still
  failed under its current id. A batch still draining blocks a new sweep of the same cloud, so a message
  being sent now is not queued twice.
- **Only `isFailed` rows qualify**, oldest first so a channel's send order survives. A pending row
  belongs to an in-flight send. The read uses `cursorNo: 1`, which bounds it to `chat_no` 0, exactly
  the unsent rows: a plain newest-page read is descending and would miss them in a channel with many
  server rows. A read that failed is carried as failed, not as "no unsent rows". An empty place id means
  every place of the cloud, because the channel cache skips the place filter then; a message from a
  place the person has since left must still go.
- **Rebuilt on resend:** a reply's parent is the full `<channelId>:<chatNo>` id (rows stranded by an old
  bug carry the bare number), and mentions are rebuilt from the row, since a resend without its mention
  record reads the same and calls no one.

### The lost-ack twin

A send can reach the server while its ack is lost, leaving a failed row for a message that exists.
Before resending, the outbox looks for the landed twin in the newest page of the channel.

- The wire carries no client id, so identity is content, a timestamp near the row's own `createdAt`
  (`LANDING_SKEW_MS`), and server-persisted only. The window is anchored to the failed row's own
  creation time, never to the enqueue time: the enqueue happens at reconnect, possibly hours after the
  send, and an enqueue-anchored window would reject every real twin.
- Content is not unique ("ok" twice), so a landed row an earlier entry claimed is skipped; without that
  two identical queued messages match the same row and the second is deleted instead of sent.
- A row is claimed at commit, after its stale local row is really gone, not at match. A manual retry
  that retires an entry mid-way leaves no orphaned claim, and a failed delete leaves the row matchable
  on the next sweep instead of resending a delivered message.
- Claims live for the outbox instance (a drain after the socket connection's periodic rotation must
  not re-match a consumed row) and are kept per partition (cloud and the uid in it), since two clouds can
  both hold `ch-1:7`. Recorded send times are pruned each sweep: every resend mints a new row id, so a
  message that keeps failing would leave a dead key per sweep in an app that runs for days.
