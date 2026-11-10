# Local mention relay

This development instrumentation forwards direct mentions from one viewed room named `public` to
the local Vite middleware. Both the compile-time `__DOU_MENTION_RELAY_ENABLED__` flag and Vite's
`import.meta.env.DEV` must be true. Normal builds load no integration and make no relay requests.
The client only knows fixed same-origin endpoints; it receives a local request nonce, never app
credentials or the destination of the relay.

`ChannelRoomPage` and `ThreadPage` require a resolved group room with actual channel name `public`; a DM nickname
is not a match. Each offers the metadata name, immutable channel/cloud IDs, the viewer's actual
room-cloud user ID, its resolved active membership, and its cache snapshot. Arming waits for a positive persisted message whose
feed coverage is confirmed and whose number reaches the channel's latest known number. Empty rooms
remain unarmed until they have a confirmed persisted message. The first snapshot becomes the saved
baseline; a server-provided baseline always wins, including concurrent tabs and reloads.

A committed session UID may still belong to a previous cloud during a switch, so it is never added
as a second viewer identity. Mixed-identity snapshots are refused before contacting the relay.

The retained observer also watches that viewer's join rows in the same cloud, including departures.
It waits for an active join with a valid `joinedNo`; missing, unresolved or inactive membership cannot
authorize relay delivery. The effective lower boundary is the greater of the saved baseline and the
highest current-membership cursor observed in this run. The saved baseline and existing packets stay
unchanged. This matters because cached messages can survive a departure on another device and must
not be exported after rejoining. The boundary is checked when an event is selected, before a queued
send, and before every transport retry. Losing the membership stops both observers and removes the
self-mention candidate. No new HTTP request or socket is added for membership observation.

Only persisted records above that boundary with an explicit `mention$.userIds` intersection qualify.
Plain `@name` text, a mention of everyone without a direct ID, other rooms/clouds, optimistic rows,
failed sends, deleted messages, system events and reactions do not qualify. Self-sent messages are
included when the local configuration says `includeSelf: true`. Only after that exact public scope
has registered successfully do its room and thread composers also offer the viewer as a mention candidate; normal
builds and every other room keep the existing exclusion. A message ID is considered once,
even if a later edit adds or changes its mention record during the same page run. The server keeps
durable delivery deduplication for submitted mentions. It does not persist IDs of non-mentions, so
a previously plain message edited into a mention after a reload can be submitted if above the saved
baseline. This instrumentation does not claim durable edit suppression for those unseen records.

Every new relay event includes `parentId`: explicit `null` for a top-level record, or the raw stored
thread parent string. A parent is valid only as a canonical positive root number or the exact
same-channel full root ID, with root number smaller than the message's `chatNo`. Invalid nonempty
or wrongly typed parents reject the event; they never fall back to a channel target. The client
never infers a thread from text or the currently viewed thread. The local middleware derives the
immutable reply context and permits thread replies only as appends to that same root. Stored rows
usually carry a bare root number; a reply send must use the full `<channelId>:<rootNo>` ID.

A direct thread link can arm or resume the relay without visiting the room first, using the same
channel metadata, feed-coverage and persisted-head guards. Arming and candidate changes do not
write to the composer's draft or send a message.

The module retains `runtime.data.getCloudRepositories(cid).chat.observeList` and a ref-counted
`runtime.sync.getSyncManager().registerChat` after the room unmounts. No poller, socket, session or
credential store is added. Logout and hot-module replacement dispose the chat, join and sync registrations, and each
emission/send checks that the cloud user is still the one that armed the relay. A different room
cannot replace the scope. Scope mismatches stop setup and require correcting the local configuration.

The observer reads the newest 1,000 cached messages. It continues across room changes while that
cloud's socket remains active, but does not keep an evicted background-cloud socket alive, recover
messages absent from the cache, or guarantee delivery while the browser is suspended/closed. Reload
and reopen the same public room to resume from the server's saved baseline. Messages older than the
cache observation window need the room's normal history loading and are not promised as backfill.

Transport failures, HTTP 408/429 and server errors get at most three attempts with the same body,
500 ms then 1 s apart. Policy refusals are final. A failed event is not retried by subsequent renders
or edits; a reload can retry it from the persisted baseline. Console status contains no message text,
nonce, account ID or destination.

## Verification

- Automated behavior coverage lives beside the relay, transport and React gate.
- In the local shell, open the public room and wait for the armed console status; select yourself
  from the mention picker and send a new message. Confirm exactly one receipt at the configured
  destination. Repeat after switching rooms, then edit the original message and confirm no repeat.
- Send plain `@name`, mention everyone, and send in another channel; confirm no receipts.
- Reload directly into a public thread and confirm the relay resumes from its saved baseline.
  Pick yourself from the mention list, and confirm the received event keeps that thread root.
  A response must append inside that same thread, with no channel-level fallback.
- Reload, reopen public, and confirm the saved baseline prevents replay of delivered messages.
- Automated retained-cache cases verify that a saved baseline of 100 and current join cursor of 200
  exclude old mention 150 while allowing new mention 202, including cursor changes while queued or
  between transport retries. Missing/inactive joins stop delivery and remove self-mention access.
- [ ] Live cross-device rejoin: after leaving and rejoining public on another device, reopen it and
      confirm pre-rejoin cached mentions do not reach the configured destination. This remains manual
      because the authenticated service's cross-device membership update and real queue receipt are
      outside the fake shell; the cache and transport decisions above are covered by automated tests.
- Live end-to-end verification requires the user's authenticated cloud and local relay destination;
  a fake-shell test alone cannot verify that external delivery boundary.

A queue-submitted receipt confirms local queue acceptance, not arrival in the destination chat. A
queue-uncertain receipt is reported as uncertain; verify it at the destination.
