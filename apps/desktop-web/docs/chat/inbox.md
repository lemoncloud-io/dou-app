# Inbox

The device-local list of what the reader should hear about (`useMentionsStore`, persisted as
`chatic-mentions`). The server keeps no notification list, so this one is filled on the device from
the channel feeds it already reads, and it does not follow the account to another device.

## What goes in

`useInboxCapture` reads `useChannelChatFeeds`. That feed hands over a channel's newest message when
the channel's number moves, because chat content streams only for the open room. So a background
channel is seen by its newest message, and a burst collapses to the last one. Each item carries a
`kind` (`shared/utils/inboxKinds.ts`):

| Kind       | When                                                                      | Item id                           |
| ---------- | ------------------------------------------------------------------------- | --------------------------------- |
| `reaction` | Someone reacts to a message of mine                                       | `reaction:<target>:<emoji>:<who>` |
| `dm`       | A new message in a 1:1 (`isNotifyDm`), an attachment-only one included    | the message id                    |
| `direct`   | A message names me (its mention record, else its text)                    | the message id                    |
| `everyone` | A message calls everyone and does not name me                             | the message id                    |
| `reply`    | Someone else replies in a thread of mine (one that `my-threads.md` lists) | the message id                    |

One message is one item. It is classified once, the strongest reason first, in the order of the
table. A 1:1 message that names me is a `dm`, and a reply that names me is a `direct`. Ordinary
channel messages are not collected.

For all kinds, the inbox skips my own messages and anything at or below the channel's read cursor.
Mute and do-not-disturb do not stop capture. A muted channel still records, as Slack does.

- **Replies.** Only `useMyThreadsCapture` knows whether a thread is mine, because it reads the thread's
  root. It hands each reply someone else wrote in such a thread to `captureInboxReply`.
- **Reactions.** A reaction event names its target (`reaction$.chatId`) and nothing of the message
  itself. The target is read from this device's chat cache and never fetched, so a reaction to a
  message this device has not cached is left out. A reaction taken back (`action: 'off'`) adds
  nothing. The item's text is the message reacted to, and its `emoji` is the reaction.

## Who reads it

- The `@` on a channel row, the mentions-only counts in the dock and place dots, and the unread
  mention count read only mention kinds (`isMentionKind`). An item stored before kinds existed has
  no `kind` and reads as `direct`, so nothing persisted is lost.
- The Activity pane (`MentionsPanel`) lists mentions only. The other kinds wait for the Notifications
  destination.
- Reading a channel marks every kind of item in it read up to the cursor (`markChannelRead`). The
  Activity pane's "mark all read" also marks every kind, including the ones it does not list.

## Limits

- The cap is 500 items, shared by every kind, and the oldest go first.
- Anything that arrived while the app was closed is never captured.
- A message crowded out by a newer one in the same channel is missed (the feed hands over each
  channel's newest message only).
