# My threads

The device's record of the threads the user takes part in — a thread they replied in, or one whose
root they wrote. It decides which threads are the user's, so that someone else's reply in one reaches
the inbox's Threads tab, and it keeps each thread's root preview, which a reply's card quotes
([inbox.md](./inbox.md#the-panel)). The Threads page shows the list itself.

## The Threads page

The Home sidebar's Threads row, above Saved, opens `ThreadsPage` in the main pane — the slot the Saved
page uses (`useSavedPageStore` `page: 'threads'`). A dot on the row means a listed thread has replies
not yet seen. The page lists this cloud's threads in the current place (`threadsInScope`; a thread
with no place is listed in every place), unread first, then by latest activity. The order is the one
the page opened with, so a card does not move while it is read; the header counts every thread.

Each card (`useThreadCard`) reads, once it nears the screen, the root and the newest three replies
from the chat cache of the thread's cloud, the root from the server when the cache lacks it. They are drawn by the
thread panel's `MessageRow` (`ThreadCardMessages`), so a card names an author by place nickname, with
their avatar, and shows images and files as the panel does. A root
from before my join, or one the server says is gone, is a notice in its place, in the thread panel's
words. Earlier replies are a link to the thread panel; when the cached window is full the link has no
count, since the thread may start before it. A card on screen for a second marks its thread seen.

Reply mounts a text-only composer (`ThreadCardReply`); files and @ suggestions stay in the panel. The
reply shows as the cache's own row for it: dimmed while it sends, with Retry and Delete if it fails.

## Why the list is this device's own

The server keeps no thread list and a root carries no reply count or participant set: a thread is only
replies that share a `parentId`. So the list is built from what passes through this device and kept in
localStorage (`useMyThreadsStore`, key `chatic-my-threads`), like the inbox. It does not follow the
account to another device, and logout clears it.

Entries are keyed by cloud, channel and root chatNo. Channel ids are per-cloud sequences, so two
clouds can each have a `5`; the cloud in the key keeps their threads apart. The list keeps the 100
most recently active threads across all clouds and places — a storage bound, so a busy cloud can push
a quiet one's threads out.

## How a thread gets in

The rules are pure functions in `shared/utils/myThreads.ts`; everything else only feeds them.

- **My reply.** `ThreadPanel` records the thread when its composer sends, with the root's preview, as
  read. This is the one source that never misses.
- **A background channel.** Chat content streams only for the open room, so a background channel is
  seen as its newest message (`lastChat$`), through the same feed the inbox rides
  (`useChannelChatFeeds`). `useMyThreadsCapture` takes a reply there: it updates a thread the list
  holds, and for any other thread it reads the root — from the cache, else from the server — and adds
  it when the root or the reply is mine. A reply someone else wrote in a thread that is mine then goes
  to the inbox (`captureInboxReply`). A root that is someone else's is remembered for the session
  so a busy thread is not looked up on every reply, until a reply of mine lands in it.
- **The cache, once.** On the first launch with the list, per cloud, the newest 200 cached messages of
  every channel are read and the threads found there are added as read — history is not news. While
  that runs, the inbox's Threads tab says it is still looking (`scanningCid`).

Neither the cache read nor the root lookup takes a message from before my current join
(`isInJoinWindow`): the room hides that history after a leave and rejoin, so the list does too.

Every read names its cloud (`runtime.data.getCloudRepositories(cid)`). The app's own repository graph
follows the selected cloud, so a switch landing between reads would hand back another cloud's rows
under the same channel ids.

## Read and unread

An entry remembers the reply number it was last looked at up to, and the thread panel being open marks
it seen, as does a Threads page card on screen. The Threads page shows that state; the inbox's reply
items are cleared separately, by reading the channel or opening the item.

## What it cannot know

- A burst of replies in a background channel reaches this device as its last message only, so the last
  reply shown can skip some, and a reply that lands while the root is still being looked up can lose
  its unread mark until the next one.
- A thread whose root was never cached and cannot be fetched is skipped, and asked about again on its
  next reply.
- No reply count is shown: what the device has seen under-counts any thread older than its cache.
- Threads from before the first launch that are not in the newest 200 messages of their channel are
  not listed until someone replies.
