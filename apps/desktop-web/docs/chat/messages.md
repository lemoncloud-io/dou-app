# How the feed draws messages

The pipeline from cached chats to what the room and the thread panel show. Both surfaces use the
same `MessageList` and `MessageRow`, so a rule here holds in either.

## Which chats become rows

`isFeedVisible` is the one filter: a chat with a `parentId` lives in the thread panel, and event chats
(`isEventChat`: reactions and revisions) are not messages. A revision left in the feed would split one
person's run of messages in two around an empty line.

- **Deleted messages stay.** The server's delete is a soft delete (the row is marked hidden, and it
  comes back on every sync), so the feed keeps the row in place as "This message was deleted." A message
  that vanishes leaves the people who were reading it with no account of what happened. The row keeps
  its author line and loses its toolbar: the soft-deleted `content` survives, so Copy or Save would
  hand back the text the row says is gone. The sidebar row prints a one-line "deleted" preview instead
  of the content, a Saved card counts the message as unreadable, and no link card is drawn under it.
- **System rows stay too.** Join and leave render as a quiet notice line (`SystemNotice`). It is
  deliberately not a live region: the feed replays its history on scroll-back, and a status role would
  make a screen reader announce every join the reader scrolls past. A subtype this build does not know
  prints the server's own `content` when that is readable, and nothing otherwise, never the raw key
  and never an empty line. A notice whose author has no name yet takes the same fallback, since a
  sentence with its subject missing reads as a bug.
- **Reactions fold from the unfiltered list.** The filter removes exactly the events the fold reads,
  so folding its output would always come back empty. The thread panel does the same.

## Rows and author blocks

`buildMessageRows` turns the list into date dividers, the unread divider, the thread's "N replies"
divider, notices and author blocks.

- Consecutive messages from one author in the same clock minute share a block, with one avatar, name
  and time. The header prints one time, so a block never spans two minutes. A retried message sorts last
  by number but keeps the minute it was first written in.
- Day dividers appear in the main feed only. The thread panel shows no date rows: each header carries
  the day, so a cross-day reply does not stack a "1 reply" divider and a date pill. Its "N replies"
  divider is flushed ahead of the first reply so a root and a following reply by the same author do not
  merge across it.
- Date rows are keyed with the message key because a pending row sorts last but keeps an old
  `createdAt`, so a bare day key could repeat.
- A webhook never merges into a person's block, even when the server sends both without an `ownerId`.
  Integrations may share one system owner and differ only in the name each post carries, so two
  webhook posts merge only when they also resolve to the same name. A webhook sender is not a member:
  its name comes from the post (see [webhook-messages.md](./webhook-messages.md)), and the roster and
  place profiles are never consulted, because its owner id could collide with a person's and borrow
  their name.

### Naming the author

The server embeds `owner$` only for persisted messages, and often not for other people's. So a
name is resolved in this order, and the header shows a skeleton while it is unresolved (no `owner$`
and the roster still loading) instead of flashing "Unknown":

- my own messages: my profile name, then my cloud display name from the roster. An optimistic row
  carries my account id and a persisted one my cloud id, and both must resolve to the same name and
  the same avatar colour, or the author would flash "You" or change hue when the server confirms;
- others: the cached author name, then the roster;
- a blank or UUID-shaped name (a guest's auto-name) counts as unresolved;
- a place profile's nick and photo then override the global ones. For my own messages the place
  override may be keyed by either of my ids (the optimistic write uses the account id), so both are
  tried.

## Text

`RichText` renders the wire dialect with no HTML injection. Fenced blocks are split out first (their
contents stay literal), then `> ` quote lines, then inline code, then the inline pass: labelled links,
bold, italic, strikethrough, bare links and `@name`. Block elements are `display: block` spans because
the host wraps a message in a `<p>`.

- A labelled link is matched before a bare one so its address is not read twice, and bold before italic
  so `**x**` is bold. Inside a mark only further marks are read, so an address or an `@name` in a mark
  stays text.
- A fence opens with three or more backticks and closes at the next run at least as long, so a block can
  hold three backticks itself. A bare word right after the opening fence is the language tag and is not
  shown. An opening run with no closing one is plain text. The newline after a closing fence is the same
  line break as the block's own end, so no empty line is drawn under a block.
- `>` starts a quote only when followed by a space or nothing, as the editor's import does, so `>_<` is a
  face.
- Links are underlined at rest: colour alone cannot carry "this is a link" in body text.
- **Mentions.** A name can hold spaces, but the token class cannot, so a token stops at the first word
  and up to three following words are tried against the roster to find where the name ends. Only a
  known member extends a mention, so an unknown `@word` before prose does not swallow it. An address
  (`lemon@lemoncloud.io`) or a password-like string is never a mention. A trailing sentence dot belongs
  to the sentence.
- A mention is drawn as a pill only if it names a known member, a group word, me, or the message carries
  a mention record. Anything else stays plain text. A known member's pill opens their profile, the same
  card an avatar opens. A name is matched by the place nickname first (what the composer's list inserts)
  and then by the global name, which still resolves a mention typed by hand. My own name and `@channel`/`@here` read louder, with a screen-reader cue
  because colour and weight alone cannot say "this is you".
- A message with a mention record highlights nothing as mine except what the record says: an `@Me` in it
  is someone else of the same name, and a typed `@channel` called no one. The "me" names include the
  roster's name for either of my ids (what a sender's `@` list showed me under); a wrong highlight
  costs nothing, unlike a missed one.

## Copying a selection

A drag across two or more messages copies them as a transcript in KakaoTalk's shape: each message starts
with `time author text` (`10:53 PM Ada hello`), and a full date line (`Tuesday, November 24, 2026`) sits
only where the day changes inside the selection, never above the first line. The browser's own copy would
carry only what is drawn, laid out as the row draws it. The feed's `copy` handler (`selectedTranscript`)
reads which rows the selection covers and writes the lines from the chats themselves, so the text is what
Copy on one message gives (a webhook card's text, not its JSON) and a message with no text reads as its
attachment label (`Photo`, `2 files`), the sidebar preview's wording (`attachmentPreview`).

- A selection inside one message is left to the browser: the reader wants those words, not a header.
- A message counts only when the selection holds some of its text. A drag that starts at the very end of
  one message, or ends at the very start of the next, does not pull that message in.
- Rows are told apart by their message key (`data-message-key`), not `chatNo`: every unsent message carries
  `chatNo` 0.
- A deleted message reads as the deleted label. Its kept `content` is never copied.
- Join and leave notices are left out, and a name still resolving reads as the row's fallback name.
- Only mounted rows can be read ([feed-windowing.md](./feed-windowing.md)): a selection that runs past the
  overscan copies up to the last mounted message.

## Link preview chip

In the desktop app only, a link under a message gets a compact chip with the source name and title. The
page is fetched and parsed by the shell's main process, because the renderer cannot read cross-origin
pages; a plain browser draws nothing.

- The chip never shows or requests the page's thumbnail. Rendering it would make every reader's browser
  fetch that URL directly and hand the third-party host the reader's IP address, user agent and the
  moment they scrolled the message into view. The component drops `imageUrl` on arrival so it cannot be
  rendered by accident.
- Results are cached per URL for the session, failures too (so scrolling never asks the shell again),
  up to 500 entries, oldest first out.
- The chip opens from zero height. Reserving the height up front would be worse: most links yield no
  metadata and the space would collapse again. Growing is a visible motion rather than a jump of the
  text under a reader who is mid-sentence.
- A deleted message shows no card under it, since it would hand the deleted link back.

## Reactions

The server keeps no reaction state: each toggle is its own chat with the `reaction` subtype, and the
chips are what the fold makes of those events.

- For each (message, person, emoji) the event with the highest `chatNo` wins, and an "off" removes the
  person from the tally rather than decrementing it. An event still in flight has no number and is
  treated as newest.
- The emoji is normalised for folding (NFC, variation selectors removed) by the same rule as the
  server; otherwise a reaction sent from one client would not cancel the same one from another. What is
  displayed is the string the event carried, since stripping U+FE0F turns some emoji into their text
  form.
- All of my ids collapse into one actor, since an optimistic event carries my account id and the
  persisted one my cloud id. Counted apart, I would appear twice and an optimistic "off" could not cancel
  a persisted "on".
- The server records the state it is told, not a toggle, so the press sends the opposite of what the
  chip shows (`mine`). A rejected toggle rolls the optimistic write back, which would look like a
  flicker with no reason, so the failure is reported on the row.
- The two one-click reactions in a message's toolbar are fixed and not driven by the recent-emoji list:
  a button the hand has learned should not rearrange itself. Only agreement and acknowledgement belong
  there; anything with meaning goes through the picker, whose recently-used tab is device-local.
- The chips row does not exist when a message has no reactions, so no strip of space is reserved under
  every message. Adding a reaction lives in the toolbar.

## Editing and deleting

Both go straight to the chat repository, and they differ there.

- An edit is optimistic: the repository writes the cache first and restores the previous record if the
  request fails.
- A delete is not. The repository writes nothing until the server answers, because a cache write
  merges and cannot roll a tombstone back to the exact previous record. So between the press and the
  answer nothing visibly changes, which reads as a press that did nothing on a slow server.
- A server that records edits answers with `editedAt` and "(edited)" follows from it. An older server's
  row was observed not to move its timestamp, so the client stamps `updatedAt` locally (never the field
  the cache orders writes by) and the next sync replaces it.
- A message can be edited or deleted only by its author and only once the server has accepted it: an
  optimistic row has no id the server would take, a failed one goes through the outbox, and system rows
  are the server's transcript.
- One hook instance serves a whole author block, so a failure carries the id of its row and which
  operation failed; "couldn't save that change" is the wrong thing to say about a delete.
