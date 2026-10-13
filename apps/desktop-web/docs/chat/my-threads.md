# My threads

The sidebar's **Threads** row opens a trailing pane listing the threads the user takes part in — a
thread they replied in, or one whose root they wrote — most recently active first. A row opens that
thread in the thread panel, switching channel or place first when it lives elsewhere.

## The pane

- **A row** names who started the thread, the channel (`#` only for a named channel — a DM reads as
  its person, the Self Channel as "You") and, outside the current place, the place. A DM's person is
  resolved live, so a DM row from another place, whose channel is not loaded, names no channel. Under
  it: the root, then the newest reply. A loaded channel is labelled the way every surface labels it;
  another place's channel is not loaded, so the row uses the name kept when the thread was last
  recorded. The time is the clock time today and the date before (`formatListTime`, shared with
  Mentions and Saved).
- **Opening a row** marks it as the one opened and opens its thread, which takes the list's place in
  the trailing slot once it is there. The list is not closed first: while another channel loads, focus
  would drop out of the pane and land in that room's message box. That thread's header then carries a
  back button, which focus starts on instead of the composer: the reader came from a list to read.
  Back reopens the list at the scroll offset it was left at, with focus on that row. Both are in
  memory only (`useMyThreadsPanelStore`).
- **Remove** (on hover) drops a thread; a later reply in it can list it again. **Mark all read**
  clears the active cloud's unread threads and shows only while one is unread.
- **Empty** says why it may be empty — that the list is this device's — and, while the first launch is
  still reading the cache, that it is looking rather than that there is nothing.

## Why the list is this device's own

The server keeps no thread list and a root carries no reply count or participant set: a thread is only
replies that share a `parentId`. So the list is built from what passes through this device and kept in
localStorage (`useMyThreadsStore`, key `chatic-my-threads`), like the Mentions inbox. It does not
follow the account to another device, and logout clears it. The pane says so in its first line.

Entries are keyed by cloud, channel and root chatNo. Channel ids are per-cloud sequences, so two
clouds can each have a `5`; the cloud in the key keeps their threads apart, and the pane and the
sidebar dot read the active cloud's only. The list keeps the 100 most recently active threads across
all clouds — a storage bound, so a busy cloud can push a quiet one's threads out.

## How a thread gets in

The rules are pure functions in `shared/utils/myThreads.ts`; everything else only feeds them.

- **My reply.** `ThreadPanel` records the thread when its composer sends, with the root's preview, as
  read. This is the one source that never misses.
- **A background channel.** Chat content streams only for the open room, so a background channel is
  seen as its newest message (`lastChat$`), through the same feed the Mentions inbox rides
  (`useChannelChatFeeds`). `useMyThreadsCapture` takes a reply there: it updates a thread the list
  holds, and for any other thread it reads the root — from the cache, else from the server — and adds
  it when the root or the reply is mine. A root that is someone else's is remembered for the session
  so a busy thread is not looked up on every reply, until a reply of mine lands in it.
- **The cache, once.** On the first launch with the list, per cloud, the newest 200 cached messages of
  every channel are read and the threads found there are added as read — history is not news.

Neither the cache read nor the root lookup takes a message from before my current join
(`isInJoinWindow`): the room hides that history after a leave and rejoin, so the list does too.

Every read names its cloud (`runtime.data.getCloudRepositories(cid)`). The app's own repository graph
follows the selected cloud, so a switch landing between reads would hand back another cloud's rows
under the same channel ids.

## Read and unread

An entry remembers the reply number it was last looked at up to. A newer reply from someone else puts
a dot on the row and its reply line in bold, with a "New reply" label for screen readers, and lights
the dot on the sidebar row — which a screen reader hears after the row's name. The thread panel being
open counts as looking: it marks the thread seen, and keeps doing so as replies arrive. My own reply
never makes a thread unread.

## What it cannot know

- A burst of replies in a background channel reaches this device as its last message only, so the last
  reply shown can skip some, and a reply that lands while the root is still being looked up can lose
  its unread mark until the next one.
- A thread whose root was never cached and cannot be fetched is skipped, and asked about again on its
  next reply.
- No reply count is shown: what the device has seen under-counts any thread older than its cache.
- Threads from before the first launch that are not in the newest 200 messages of their channel are
  not listed until someone replies.
