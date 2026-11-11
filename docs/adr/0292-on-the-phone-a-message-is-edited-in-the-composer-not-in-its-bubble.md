# ADR-0292: On the phone a message is edited in the composer, not in its bubble

> Status: Accepted · Decided: 2026-11-09 · Implemented: `feat/web-edit-in-composer`
> · Scope: `apps/web/src/app/features/channels/` (`ComposerEditBar`, `useMessageEditing`,
> `ChannelMessageRow`, `ChannelRoomPage`, `ThreadPage`, `useChatScroll`)
> · The module doc is [apps/web channels/chat-room.md](../../apps/web/docs/feature/channels/chat-room.md)
> · Related: [ADR-0103](./0103-web-message-edit-delete-and-non-optimistic-delete.md), whose save and
> seeding rules this keeps; [ADR-0183](./0183-each-conversation-keeps-its-composer-draft.md), whose
> decision 5 this restates

## Context

The web app edited a message in place: the bubble turned into a text field where it sat, with its
own Cancel and Save, and the composer was disabled for the duration. The position said which message
was changing.

On a phone that field was cramped. A bubble is often narrow and sits wherever the message happens to
be, the field grew inside the conversation it was meant to leave in view, and with the composer still
on screen there were two text fields, one of them disabled, and the keyboard feeding the one in the
middle of the list.

## Decision

**The composer is the editor.** Edit in the action sheet turns the composer into the edit:

- **A strip above the field** says it is an edit, quotes the message being changed on one line, and
  holds the cancel. The field holds the draft; the send button and Enter (wherever Enter sends) save.
  The quote takes over what the in-bubble field said by its position.
- **The row stays as it was**, outlined, and is scrolled into view once when the edit opens. It opens
  no action sheet meanwhile, and does not show its edited mark.
- **Text only.** The attach button, the photos waiting to go and the `@` list step aside while the edit
  lasts.
- **The new message being written is kept aside**, untouched, and is back in the field when the edit
  closes. The edit itself is not drafted, as before.
- **Only the save locks the field.** The room's input lock and the empty-1:1 lock stop something new
  from being sent; an edit sends nothing new.
- **The list does not follow the composer during an edit.** Opening the edit focuses the field and
  grows the composer, and the room's bottom pins would carry the list away from the message being
  changed. The room holds those two pins (not the new-message handling, which still keeps a reader in
  history in place); the thread holds its follow-the-newest-reply scroll the way a jump does, and
  gives it back on close only to a reader already at the bottom.

What ADR-0103 settled stays: the save waits for the server and a failure keeps the draft, and the
edit is seeded from the message's body, never from the truncated bubble.

Desktop keeps its in-place editor; a pointer and a wide window do not have the phone's problem.

## Alternatives

- **Keep the in-bubble field.** Rejected for the reasons in Context.
- **A full-screen edit sheet.** Rejected: it hides the conversation the edit belongs to, and a phone
  would gain a second message-editing surface to keep in step with the first.
- **Edit in the composer but discard the new message being written.** Rejected: an edit is a short
  interruption, and losing unsent words to it is the kind of loss the draft store exists to prevent.

## Consequences

- One textarea now serves two jobs. It stays one element on purpose: the keyboard stays up as an edit
  opens and closes, and listeners bound to the field at mount (the focus pin, the `@` list) keep working.
  Splitting it into two would silently drop both.
- On a hardware keyboard Enter now saves an edit where it used to insert a newline, because the edit
  follows the composer's send rule.
- The edit is text only on the phone. Changing a message's attachments is a separate question, and needs
  the server to accept them in an edit first.
- `useChatScroll` gained `holdBottomPin`, a narrower hold than `suppressAutoScroll`; and its focus pin now
  respects both.
