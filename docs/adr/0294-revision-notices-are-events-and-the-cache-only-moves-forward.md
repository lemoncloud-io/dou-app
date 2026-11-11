# ADR-0294: Revision notices are events and the cache only moves forward

> Status: Accepted · Decided: 2026-11-09 · Implemented: `feat/message-edit-delete-sync`
> · Scope: `libs/data` (`isEventChat`, `isFeedVisible`, `isMessageEdited`, `ChatRepository.refreshList`,
> `ChatLocalDataSource`), `libs/sync` (`plans.ts`), `apps/web` (thread builders, search, message detail),
> `apps/desktop-web` (feed rule, thread builders, search, `messagePreview`, edited marker)
> · The module docs are [libs/data repositories/domains.md](../../libs/data/docs/repositories/domains.md),
> [libs/sync README](../../libs/sync/README.md) and
> [apps/web channels/chat-room.md](../../apps/web/docs/feature/channels/chat-room.md)
> · Related: [ADR-0103](./0103-web-message-edit-delete-and-non-optimistic-delete.md), whose edited-marker
> inference this keeps as a fallback

## Context

Editing or deleting a message changed the message's own row and nothing else. The room's chat number did
not move, and the app catches up on a room by number, so a device that was off at the time never learned
of the edit, and kept showing a deleted message.

The chat server now records each edit and delete as a **revision notice**: a `stereo: 'system'`,
`subType: 'edit'` row on the room's next chat number, with no body and `edit$: { action, chatId }` naming
the message that changed. The message itself is changed in place as before — an edit replaces the text
and stamps `editedAt`, a delete sets `hidden` and empties the body and attachments. The notice is only a
signal that a message changed.

The app did not know the notice. Its feed rule hid reactions and replies but not this, so a notice made by
someone else reached the room as a system row with no text it could print: the web app drew an empty
notice line, the desktop app split the sender's run of messages around nothing. The author did not see it,
only because the app hides one's own system rows.

Two kinds of server are live at once. A cloud keeps the older server until it is redeployed, and that
server writes no notice and no `editedAt`. The app ships before the newer server reaches production, and
has to be right against both.

## Decision

1. **A revision notice is an event, not a message** — the same standing as a reaction toggle. One
   predicate, `isEventChat` (`reaction` or `edit`), feeds the feed rule `isFeedVisible`, the thread
   builders and search in both apps. Previews, notifications and unread counts already skip system rows.
2. **The notice brings its message to the current state, and edit and delete are not told apart.**
    - Live receipt and reconnect catch-up are the sync plan's (sockets-lib 0.7.1): it re-reads the
      messages a catch-up's notices point at and hands each to `onUpdate`, which writes it like any
      change.
    - Pages the app reads itself — opening a room, a gap, older pages, a re-check — go through
      `ChatRepository.refreshList`. After writing the page it re-reads the messages the page's notices point
      at, only those already cached and not already in the page, without holding up the page. Each notice is acted on once per session — those reads run for every room's newest page, and a notice stays there until newer messages push it out. A message no longer on the server (404/403) settles the notice too; any other failure leaves it open for the next page that holds it. A re-read row is written only if the message is still cached when the answer lands.
    - The re-read row says what the message now is. `edit$.action` is not read, so any later kind of
      change the server signals the same way needs nothing here.
3. **The cache only moves forward.** `ChatLocalDataSource` does not write a row whose server time
   (`updatedAtMs`) is older than the cached copy's. A re-read can land after the change the server pushed
   live, and two quick edits can come back in either order. A row with no server time (one being sent) and a row with an equal time are written as before; a delete mark inferred from a page is a copy of the cached row, so it carries an equal time.
4. **"Edited" is `editedAt` where the server sends it, and the old inference where it does not**
   (`updatedAt` past `createdAt`). The desktop app's own copy of the rule goes; both apps read
   `isMessageEdited` from `@chatic/data`.
5. **A deleted message reads as deleted wherever it is quoted.** The newer server empties a deleted
   message's body, so places that printed the body without asking whether it was deleted would show a
   blank line. The desktop app's one-line `messagePreview` (lists, the threads page, OS notifications, the
   inbox) and the web app's full-message dialog now say the message was deleted.

The older server's behaviour is kept: `markMissingHidden` stays, since a page leaving a row out is still
that server's only delete signal.

## Alternatives

- **Apply the notice by its action** — a `delete` notice tombstones the message at once, an `update`
  re-reads it. Rejected: the server decided notices are a signal and the device converges on the
  message's own state, so a future change signalled the same way works without a client release. A
  tombstone that waits for the re-read costs a moment; a client-side rule about actions would have to be
  kept in step with the server.
- **Apply notices at the cache's write point**, for every write that carries one. Rejected: it would
  re-read from inside storage code, which never touches the network, and the sync plan already covers the
  live path. `refreshList` is the one place the app's own pages pass through.
- **Retry failed re-reads in `refreshList`.** Rejected: the notice comes through again with the next page
  that holds it, and the sync plan already retries on reconnect. A retry loop here would pile up requests
  during a server outage.
- **Drop the edited-marker inference.** Rejected while older servers are live: every message edited
  against one would lose its marker.

## Consequences

- The app must reach production before the newer server does. A server that writes notices to an app
  without this draws empty lines for every edit and delete someone else makes.
- `@lemoncloud/chatic-socials-api` is pinned at `5.26.1103` (exact), the first types with `edit`, `ChatEdit`
  and `editedAt`; `@lemoncloud/chatic-sockets-lib` moves to `0.7.1`. The chat sync plan is typed by
  `ChatView`, because 0.7.1's own message shape (`subType: string`) is looser than the mappers take.
- A message whose notice scrolled below the catch-up window is brought up to date only when a page holding
  the notice is read — the same moment the reader would scroll to it.
- The ordering rule applies to every chat write, not only notices. A local write that wants to win must
  not carry an older server time; the desktop's local "edited" stamp for older servers writes `updatedAt`,
  not `updatedAtMs`, and so does not hold back a later change.
