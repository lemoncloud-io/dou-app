# Opening a room from somewhere else

`HomePage` is where a notification click, a saved item, a message link, a mention, a started 1:1 or a
plain list pick ends up selecting a room. Opens that need data that has not loaded yet are deferred as
"pending landings". The room-specific rules for 1:1s and the Self Channel are in
[direct-messages.md](./direct-messages.md); the way back is in
[jump-and-return.md](./jump-and-return.md).

## Which room the screen selects

`landingTarget` runs whenever the channel list changes.

- A pending target that the list now carries wins, but only once any place switch it waits for has
  finished. The Self Channel is listed in every place, so "listed" alone would land the open in the place
  being left.
- A pending target that is not listed yet leaves the selection alone while the current selection is
  still valid, so waiting for a new room never snaps to another one.
- When the selection is gone from the list, the fallback is the channel last opened in this cloud and
  place, else the first channel with unread, else the first. A place badged "1" that opened on a channel
  with nothing new led nowhere; the first unread one is what the badge was pointing at.
- Remembered channels and the last place are kept per cloud and place, because place and channel ids
  repeat across clouds.

## What an open does once the room is on screen

`openLandingOf`: a thread reply opens its thread panel, a copied message link lands the feed on that
message, anything else opens the conversation at its latest message. Never two of these, since a reply is
not a row of the feed. A thread is deferred until its channel is selected and loaded, because selecting a
different channel closes the thread panel on its way in and a same-tick open would be clobbered. When the
channel is already the selected one the thread opens inline: nothing would shut the panel and the
deferred effect would not fire again.

Every open records where the reader stood before anything moves (the message at the top of the feed and
the thread beside it, not only the channel), including a jump inside the open channel. Picking a
channel from the list, a cloud or a place is a deliberate move and retires any return point.

## Message links

A copied link is `<scheme>://message/<cloud>/<place>/<channel>/<chatNo>`, with `?root=<id>` for a thread
reply. The scheme is the shell's own (the dev channel's differs), read when the link is built, because the
registry answers nothing before boot. It opens only for someone who is a member: the link carries nothing
but ids, and the app resolves them against the reader's own clouds and channels.

Any web page can open the scheme, so a link may only move the reader to a cloud this device already
lists (the home cloud included), never one it would have to look up. A notification's target comes from
the reader's own pushes and is not held to this. If the cloud list is not in yet (a link that started the
app), the link is judged again when it lands.

## Waiting for the socket, and giving up

- A push-driven cloud or place switch re-issues tokens against the active server. Fired over a half-open
  socket (a cold start, a just-refocused window) it races the connection, fails and rolls the selection
  back, which stranded the notification target unopened. So the switch first waits up to 10 s for the
  base handshake and then fires anyway.
- The rails are locked until the socket has re-verified on the new cloud, not just until the token
  exchange resolves. The exchange resolves before the socket rebinds and the new cloud's data loads, and
  switching again in that gap races the sockets and flickers the list.
- Pending landings arm on intent and clear on success, with no failure branch. After a rolled-back
  switch, or a room that never reaches the list, nothing would consume them and they would fire on some
  later load that happened to match. Every arming starts a 30 s timer and whatever is still pending is
  dropped when it fires. Re-arming restarts it and unmounting cancels it. An open that cannot happen (its
  switch failed or was refused) drops the landings at once; a switch refused because another is running
  is given up too, since that one heads somewhere this open did not choose.
- The place auto-select skips a place it already tried until the selection settles. A refused switch
  rolls the selection back to the same unlisted site, and without the skip every failed switch started
  the next. A failure over a dead socket says nothing about the place, so a socket that comes back (or
  another cloud or account) starts it over. Nothing is auto-corrected while a switch is in flight: the
  place list and the selected site update on independent timelines, and a transient mismatch would
  switch against a stale or other-cloud place.
- A rail chord asks the room it opens not to take the caret, so the next chord moves the rail instead of
  typing into the box. The request is dropped when the switch settles, and 3 s after the chord when no
  switch follows (15 s while one runs), so it cannot swallow the focus of a later click.

## Scope of what the screen reads

- The channel list is scoped by the session's site id, not by the UI's selected place. The Default Cloud
  spans several sites (the relay's own site holds the Self Channel) and its UI scope is a `default`
  sentinel, which is a cloud id and matches no channel record. Only an invite join selects a site there,
  so it usually has none and its rows are listed without one, a new account's Self Channel among them.
- A subscription cloud with no place still lists its 1:1s, but only once the places are known to be
  empty; while they load or a switch runs, "no place" just means "not yet". With no place left the
  session's site id is not read at all, since after the last place is deleted it still names that place
  and its cached channels would be listed instead of the 1:1s.
- Other clouds' unread cannot be counted (the socket serves the active cloud only). A push received for
  another cloud marks that cloud's tile instead.
- The open channel's members are keyed off the channel resolved from the loaded list, not the raw
  store id. After a cloud switch the store can briefly hold the previous cloud's channel, and fetching its
  members sends a cross-cloud member list to the new socket, which the relay refuses as not-a-member.
- The thread panel's channel is held through a place switch (`useHeldChannel`): the list is replaced
  under an unchanged selection, and a panel rebuilt for the same room would fetch everything again.

## Read state

The open channel is marked read up to its latest message, so it never shows unread after the reader
switches away, but only while the window is visible and focused. A message arriving in a hidden window
must not advance the cursor, or the desktop-notification logic would take it as already read and
suppress the OS banner. On refocus the chat pane's read receipts flush the read and the badge clears.
