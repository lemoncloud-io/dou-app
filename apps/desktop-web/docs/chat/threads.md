# Thread panel loading

The thread panel shows one root message and the replies under it. Nothing on the server lists a
thread: the backend knows a reply only by its `parentId`, and the feed (`chat.feed`) takes a channel,
a cursor and a page size, never a thread. So the panel works from the same message window as the
channel and finds its thread inside it. This page is about the case where that window does not reach
the thread, which is the normal case for a thread opened from a mention, a saved item, a notification
or a jump. `useThreadRoot` (`features/chat/hooks/useThreadRoot.ts`) owns it.

## The window

`ThreadPanel` reads the channel through its own `useChats`. That hook observes only the newest
messages and widens the window one page at a time. A thread whose root is older than the window has
no root in it, and its replies are only the newest ones.

The panel's `useChats` is a second instance beside the channel pane's, with its own window. Paging it
back does not move the pane: the pane keeps showing the page it was reading, and the scroll position
there is untouched. Both instances read and write the same cache. The panel starts from the depth the
room remembers but does not save its own (`persist: false`), so a thread's paging never widens the
room the next time it opens.

## Finding the root

When the root is not in the window, the panel asks for that one message by id (`<channelId>:<chatNo>`,
through `chat.get`). It does so only after the window has finished loading, so a thread whose root is
in the window costs no extra request. The repository writes the fetched row to the cache; the feed
observer reads only the newest rows, so a lone old row does not show up in the channel.

What the panel says while it has no root:

| State        | When                                                   | Shown                                          |
| ------------ | ------------------------------------------------------ | ---------------------------------------------- |
| `loading`    | the window or the fetch is still on its way            | a spinner and "Loading thread…"                |
| `beforeJoin` | the root's number is at or below my current `joinedNo` | "from before you joined", nothing is requested |
| `gone`       | the server answers not found or not allowed            | "no longer available", no retry                |
| `failed`     | any other failure (network, timeout)                   | "Couldn't load", with "Try again"              |

`beforeJoin` is decided from the number alone, with `isInJoinWindow`. The server windows reads by the
same cursor, so the message can never arrive, and asking would leave a spinner that never ends. A
fetch that answers after the panel moved to another thread or channel is dropped.

## Finding the replies

A root fetched from outside the window leaves every message between it and the window's oldest one
unloaded, and the replies among them. The panel pages the feed back (`loadOlder`, 50 messages per
page) until the window reaches the root's number or there is nothing older.

It does not do that without limit. One batch is `REPLY_PAGES_PER_BATCH` pages. When a batch ends
before the root, the panel stops and puts a "Load earlier replies" row right under the root. Each
press loads one more batch and then stops again; nothing resumes by itself. The row is gone once the
window reaches the root or `hasMore` is false.

The next page is asked for only after the previous one has shown up in the window, because the
window re-reads the cache after a fetch lands. A page that fails, or lands without bringing anything
older, turns the row into "Couldn't load earlier replies" with "Try again". Whatever is already on
screen stays: the root, the replies so far and the composer. A reply can be sent in any of these
states, and a new reply appears at once, since it arrives in the newest part of the window.

## What this does not do

- It does not ask the server for a thread. A thread buried under thousands of messages costs a batch
  of requests per press until a thread-scoped query exists.
- It does not page the replies of a root that is already in the window: all of them are newer than
  the root and so already loaded.
