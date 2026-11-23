# Unread badges

How a channel's unread count is derived and kept fresh, and how the place and cloud dots are fed. The
logic is in `src/app/shared/utils/channelUnread.ts` and `placeUnreadCounts.ts`, and the hooks beside
`useChannelReadCursors`, `usePlaceUnreadCounts` and `useRefreshOnPush`. What the dock, place dots and
window title show is in [notifications.md](./notifications.md#dock-place-dots-and-window-title).

## One channel's count

`computeChannelUnread` is client-side, most trusted source first:

1. My own message is the latest: 0. The server does not move the sender's read cursor on send, so the
   server's own summary counts a just-sent message as unread; a place the person just posted in
   must not show a phantom badge. "Mine" is the account id or the channel's cloud user id
   (`$join.userId`), because outside the relay a stored message is owned by the cloud id.
   Only a message someone wrote implies "read up to here": a reaction I left on an unread channel is
   also the head, and clearing on it would hide messages never opened.
2. A known read boundary: the count of user messages past it, using whichever of the observed join row
   (`useChannelReadCursors`) and the cursor on the channel record (`$join`) has read further.
3. No boundary yet (join cache cold, never opened this session): the server's `unreadCount`. It lags
   and does not clear by itself, but a present stale badge beats a silently missing one, and the first
   read replaces it with the derived count.

The result is then capped by this device's own read cursor (`useReadCursorStore`): no more than the
slots above it can be unread. Without the cap, reading a channel and then receiving one message re-showed
the whole backlog until the read receipt round-tripped. The cap is skipped for a cached row with no
`chatNo`, which would otherwise swallow the `unreadCount` fallback.

- **Chat slots are not messages.** `chatNo` counts user and system messages in one sequence, and
  `metaNo` is the cumulative count of system ones (reactions are `stereo: 'system'`), so
  `chatNo - metaNo` is the user-message count on both the head and the cursor. Without netting, a
  reaction raised a badge on a channel with nothing to read. A join row with no `metaNo` nets nothing and
  degrades to the raw delta until that channel is read. The head and `metaNo` must come from the same
  record; `lastChat$.chatNo` is another snapshot. The client's `stereo === 'system'` test (own-message
  rule) and the server's `metaNo` counter agree only while the server's countable rule excludes exactly
  that; if the server widens it, they disagree silently.
- **`joinedNo` counts as read.** Messages from before I joined are not mine to catch up on, as the
  server's own count reads it. The join cache row and the inline `$join` are separate records with
  independent freshness, so the one that has read further wins, and on a tie the one carrying `metaNo`.
- **The cursor is read from the join cache directly.** The channel record carries no usable per-user
  join, so `useChannelReadCursors` registers a `join` sync target per channel (`<channel>@<uid>`, the uid
  being the one my account has in that channel's cloud, registered for that cloud by name) and observes my
  row's `chatNo` and `metaNo`. A sync target is refcounted by key, so the sidebar and the place totals
  share one. Without it the cursor never advances and badges freeze at the server's last count.
- **The inbox follows the same boundary.** A cursor advance, here or on another device through the
  synced join row, marks the inbox items at or below it read without opening each one.

## Reading and the receipt

`useReadReceipts` reports the highest loaded `chatNo` of the open channel through its own cloud's
`join.readChat`, debounced by `DEBOUNCE_MS` (500 ms), only while the window is focused and visible and
only when the number increases. The local cursor moves at once so the badge clears without waiting for
the round trip, and also on every arriving message while focused so it never flashes during the
debounce. Pending optimistic rows carry the sentinel `Number.MAX_SAFE_INTEGER`, which is never sent as a
cursor (the server rejects it); only persisted rows advance the position. The server half goes through
the join outbox, which resends until it lands, so only a refusal rejects.
`liveReadRegistry` records which channels have a mounted driver; badge hooks consult it, not the
selection, because the selection survives route changes that unmount the pane.

## Place and cloud totals

`usePlaceUnreadCounts` fetches every channel of the active cloud into a flat list
(`channel.fetchList`, `hasSite: false`, up to 500) and derives counts client-side. It deliberately does
not read the engine cache, which keys channels by `cid:uid:id` with no place, so channel ids that repeat
across places can hold only one place's channels at a time. A flat array holds them all.
The list carries the cloud it was fetched for, so nothing is filed under the cloud switched to, and a
superseded fetch's late answer is dropped.

- **Counting rules** are in `placeUnreadCounts`: a 1:1 counts in its own place, my notes-to-self room
  in every place but once in the total (the total is summed per channel, not per place, since the place
  numbers overlap), and a cloud 1:1 naming no place counts in the total only, and only where the sidebar
  lists it. A muted channel counts nowhere. A mentions-only channel counts its unread mentions, capped
  at its unread messages, so quiet chatter stays out and a mention read on another device stops counting.
  A place dot says "something here wants you"; the row itself still shows its full unread. A mention
  that arrived while the app was closed lights nothing here.
- **Refetch signals:** the socket verifying (it dips and rises on a switch, after the new cloud's
  handshake), an inbound push, or a raw socket chat frame, debounced by `REFETCH_DEBOUNCE_MS`. The mute
  and mention stores are subscribed, so muting or capturing a mention moves the dots without a refetch.
  The open channel is read live while the window is focused and visible, so its contribution stays 0
  without re-pulling the cloud; background channels, a blurred window and unnamed frames still refetch.
- The same list seeds the quick switcher's index, which otherwise knew only places opened by hand.

## Staying fresh between polls

The backend streams no channel-record updates for background channels, and the chat sync plan applies
only the focused room, so without help a badge would wait for the 60-second cloud-wide `channel.sync`.
`useRefreshOnPush` listens to two signals, since one alone misses cases: the shell-forwarded push, and
the raw socket chat frame, which reaches `onServerMessage` for every place of the cloud even though the
sync plan ignores it.

- A signal that names its channel refreshes just that row (`refreshOne`, with the place a push deeplink
  names, else the place resolved from the cached row); an unattributed one, an unparseable link, or
  more than `MAX_TARGETED_PER_FIRE` (10) channels falls back to re-pulling the whole list. A burst is one
  debounced fire (300 ms), and a gone channel does not cancel the rest.
- A cross-cloud push is skipped: asking the active cloud's session about a foreign id would be wrong.
  That cloud's own receive loop owns it. A browser's push port has no `notifications`, so there only the
  socket frames count.
- The site is read through a ref when the debounce fires; as a dependency it would unbind the listeners
  on every place switch.

## The cloud dot

The live socket covers only the active cloud, so another cloud's unread cannot be counted.

- **A push marks its cloud** (`useCrossCloudPushBadge`, `useCloudPushBadgeStore`, persisted so a push
  that lands while the app is closed and replays on boot survives). The dot clears when that cloud
  becomes the verified active one. The clear is keyed on whether the active cloud is currently
  badged, not on the verify edge, so a mark that lands after the handshake (a push during the relay
  fallback or mid-switch is attributed to the now-active cloud) is still swept; otherwise the tile
  and the dock's +1 stick.
- **Leaving a cloud with unread keeps its dot** (`useRetainLeavingCloudBadge`): unread is computed only
  for the active cloud, so on a switch the cloud being left is snapshotted and, if it still had unread,
  marked until it is revisited.
