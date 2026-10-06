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

What the room remembers (depth, and whether older history ran out) is keyed by cloud, account and
channel. One account in two clouds can show the same uid, and each cloud's Self Channel has the same
id; without the cloud in the key, a short channel that ran out of history in one cloud told the other
there was nothing older, and a thread's replies never paged.

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
| `gone`       | the server answers not found or not allowed            | "can't be shown here", no retry button         |
| `failed`     | any other failure (network, timeout)                   | "Couldn't load", with "Try again"              |

`beforeJoin` is decided from the number alone, with `isInJoinWindow`. The server windows reads by the
same cursor, so the message can never arrive, and asking would leave a spinner that never ends. A
fetch that answers after the panel moved to another thread or channel is dropped.

The server answers a read from the place the session is in, so "there is no such message" and "it is
out of reach from this place" look the same on the wire (a saved reply of the Self Channel, which every
place lists, can be opened from a place that cannot fetch it). The wording says "here" for that reason,
and a `gone` or `failed` verdict is keyed by the place it was asked from: when the place changes the
panel asks again, and a fetch still in flight from the old place is dropped. A root that arrived stays.

"Changes" means the switch has finished, not that the selection moved. The selected place flips at the
start of a switch and the socket session follows when `auth.switch` returns, so a read sent in between is
still answered from the old place, and its refusal would pin the panel on the text above. The panel
therefore sends nothing while the runtime reports a place or cloud switch in flight (the
`SWITCH_SITE_MUTATION_KEY` / `SWITCH_CLOUD_MUTATION_KEY` signal that background sync also pauses on),
shows "Loading thread…" for that stretch, and asks once when it ends.

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

## Leaving the channel

The thread store records the channel a thread was opened in, because the root id is a bare `chatNo`
and means nothing without it. `useTrailingPanelOwners` hands the panel the thread only while that
channel is the one the pane is showing, and closes the thread as soon as they stop matching. The close
runs in an effect after the render that first sees the new channel, which is why the match is checked
in the hook's return value as well; a panel drawn in that one render would otherwise fetch the old
thread's number in the new channel.

A place switch is not leaving the channel. The channel list is replaced under an unchanged selection
(a Self Channel is in every place, so the reader is still looking at it), and the lookup of the
selected channel finds nothing for a moment. `useHeldChannel` keeps the last channel resolved for the
same id while the list is loading, so the panel stays mounted and nothing is fetched again; once the
list has loaded, the lookup is the truth, and a channel that is not in it closes the thread. A
different selection never borrows the old channel.

A thread opened while the list is still loading and no channel has been resolved yet (a saved or
mentioned reply clicked right after start, in the restored selection) is held: not drawn and not
closed until the list answers. It shows if the channel is there and closes if it is not.

## The reply count

While older replies are still out, the "N replies" divider says "N replies loaded" ("불러온 답글 N개"),
because the number is what the window holds, not the thread's size. It goes back to "N replies" once
the window reaches the root.

## What this does not do

- It does not ask the server for a thread. A thread buried under thousands of messages costs a batch
  of requests per press until a thread-scoped query exists.
- It does not page the replies of a root that is already in the window: all of them are newer than
  the root and so already loaded.
