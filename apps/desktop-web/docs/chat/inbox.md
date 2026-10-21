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

Each item also keeps where it happened: `channelName` for a channel, `inDm` for a 1:1. The list is
read long after the place's channels have left memory, and a reaction in a 1:1 would otherwise not
say it was one.

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
- The Notifications panel lists every kind (below), and the nav rail's Notifications tile carries a
  dot while any item is unread.
- Reading a channel marks every kind of item in it read up to the cursor (`markChannelRead`).

## The panel

`NotificationsPanel` (`features/chat/components/notifications/`) is the Notifications destination's
sidebar column. What it lists is one pure function, `inboxView`.

- **Tabs.** All, Channels, DM, Threads and Mentions, each badged with its unread count. The first four
  sort by where an item happened (`inboxSource`): a thread first, so a reply or a mention inside a
  thread is a Threads item; then a 1:1, so a DM or a reaction in one is a DM item; everything else is
  a Channels item. Mentions sorts by why: every mention of me or of everyone, wherever it was.
- **Unread filter and sort.** The filter shows unread items only. The orders are newest first, oldest
  first, and unread first, which lifts each day's unread items above its read ones rather than
  pulling all of them to the top, so a day heading is never drawn twice.
- **Date groups.** Today, Yesterday, then the weekday and date.
- **A card** shows who, when and a red dot while unread; the source chip, the channel (`# name`, or
  the person for a 1:1) and why it is here; for a reply, the thread's root as this device recorded it
  ([my-threads.md](./my-threads.md)); then the text, with `@names` accented in a mention. An unread
  card is raised, a read one sits on the panel, and the one opened last has the accent border.
- **Opening** a card jumps to the message (or opens its thread) through `HomePage`'s `jumpToSaved`
  and marks the item read. Under the unread filter that would drop the card from under the pointer,
  so the opened one stays, marked, for 3 seconds (`OPENED_LINGER_MS`) and then leaves. The jumped-to
  message flashes for the same 3 seconds. Changing the tab or the filter lets the card go at once,
  and unmounting clears the wait.
- **Selection.** The header's select button turns the cards into checkboxes and the header into a
  selection bar: a select-all box (mixed while only some are chosen), its menu (select unread, clear,
  mark all as read), the count, then mark as read and delete. The selection is of the cards listed,
  so changing the tab or the filter drops it. Delete asks first and removes the items from this
  device only. Mark all as read covers every unread item of the open tab, listed or not, ends the
  mode, and its toast's Undo clears the read mark of exactly the items it marked — an item deleted
  meanwhile stays gone, and one read before keeps its own time.
- **Empty.** A bell, "No new notifications", and that the list is this device's. On the Threads tab,
  while the first launch is still reading the cache for threads (`scanningCid`), it says so instead.
- With Notifications open and no conversation chosen, the main pane says a notification opens its
  conversation there.
- The snooze menu sits in the panel header as a bell. Tab, filter and order live in memory
  (`useNotificationsPanelStore`), so leaving the destination and coming back finds them as they were.

## Limits

- The cap is 500 items, shared by every kind, and the oldest go first.
- Anything that arrived while the app was closed is never captured.
- A message crowded out by a newer one in the same channel is missed (the feed hands over each
  channel's newest message only).
