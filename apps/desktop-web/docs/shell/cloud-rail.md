# Cloud switcher

The top of the left rail (`CloudSwitcher`, `features/chat/components/CloudSwitcher.tsx`): the active
cloud's 48px tile with a chevron under it. The tile is black in both themes (`--tile-active`) with a
lime initial. Pressing it opens a menu that lists every cloud, Home (the Default Cloud) first, each
with a small chip of its initial. Picking a row switches to that cloud. The place tiles sit under it,
past a divider ([place-rail.md](./place-rail.md)).

The clouds used to be a rail of their own, one tile each. The design folds them into one rail with the
places, so the tiles became rows and their right-click menus became items in the switcher's menu.

## Names

A cloud is named with `cloudLabel` (see [`../chat/room-names.md`](../chat/room-names.md)). A cloud with
no name, or with the server's generated setup name (`#cloud/<n>/<n>`), reads "Untitled cloud". A
cloud that cannot be opened as it is says why in its label, before a click on it fails: "(setup
failed)", "(setting up)", "(suspended)" or "(expired)". The Home
row's name is a UI string (`cloud.home`), so it reads "홈" in Korean rather than a literal "Home".

`cloudTiles` (`shared/utils/tileInitials.ts`) turns the names into the initials on the tile and the
chips. One shows one letter, and only clouds that would read the same take more: first the name's trailing number, then
its second letter, so "test-lemon" and "test-lemon2" read "Te" and "T2", and "Team" and "Tokyo" read
"Te" and "To". An untitled cloud has no letters of its own and reads "?"; when there are several,
they are numbered in both the chip ("?1", "?2") and the label ("Untitled cloud 2"). Before this,
two untitled clouds both read the fallback label's first two syllables.

## A cloud that cannot be opened

A row whose cloud is not `active` has a chip with a dashed edge and muted ink at full opacity. A
selectable row is never drawn at half opacity: that took the old tile's initial well under text
contrast.

A suspended or expired cloud is one its subscription no longer keeps open (`isLapsedCloud`). Only a
subscription reopens it, and desktop sells none: subscriptions and new clouds are in the DoU mobile
app. So its row says that under the name, and picking it does not try to switch. It shows a toast
with the same line and the App Store and Google Play links (`MobileAppPointer`) instead. A switch
into it used to be refused and then offer Try again, which could never work.

## Renaming a cloud

The switcher's menu offers "Rename cloud" only while you are in a cloud you own (`canRename`), and it
renames that cloud — never Home, an invited cloud, a lapsed one, or an owned cloud you are not in.
`cloud.update` goes out on the active slot's socket, so renaming another cloud
would send its id down this cloud's connection and write its row into this cloud's cache; apps/web
likewise edits only the active cloud. Names are 2 to 30 characters, as on web. It opens
`RenameCloudDialog`, a one-line field shaped like `RenameChannelDialog`. `useRenameCloud`
(`shared/hooks/useRenameCloud.ts`) writes through `CloudRepository.updateCloud`, which also rewrites
the cached cloud row, and patches the new name into the relay catalog query the owned rows read.
The tile, the row and its label change at once, without waiting for the broker list to catch up.

A cloud's name has two sources, and for an owned cloud the local one wins. The relay catalog lists
the cloud with a name that can lag a rename by a while, so after a reload it may still show the old
one. A rename also writes the new name into the local cloud cache (one global partition, kept across
reloads), which `useClouds` observes: when that row carries a name, the switcher uses it instead of the
catalog's. With no cached name the catalog's name stands, and an invited cloud keeps reading only
its own cache row. The cache row is overwritten when `cloud.get` runs for that cloud, which the
app does only to refresh an invited cloud's name.

## Order

The menu lists the clouds in the order this device stored when they were tiles that could be dragged.
Home is the way back from every cloud, so it is listed first whatever was stored, and the reload item
comes after the clouds. A dropdown row does not drag, so the order can no longer be changed on the
desktop; the stored order is still honoured.

The order is a preference of this device, not of the account: it is stored in the local config
record `ui.railOrder` (`useCloudOrder`, `@chatic/shared`) and nothing is sent to the server, so
another device and the mobile app keep their own. A cloud the stored order does not name yet is
listed after the ones it does. A stored id whose cloud is not listed is skipped but kept: the list
can be partial (see the reload item below). Logging out
clears the record with the rest of the account's preferences.

Only the switcher reads the order. The account pages and the cloud sessions kept in the background
list the clouds as the sources give them. An untitled cloud keeps its number whatever the stored
order: the numbers are given in the sources' order.

## Unread

The switcher tile carries a dot when any cloud has one, and its accessible name says so
(`cloud.switcher.unread`); each row in the menu carries its own. The active cloud's dot comes from
the live socket. Another cloud's dot is a pending cross-cloud push
(`useCrossCloudPushBadge`), the only signal the client has for it, and it carries no count. Home takes part like any cloud: a relay push names its source `#`, which `pushCloudIdOf` reads as the
Home's `default`, so a relay message dots Home while another cloud is open, and the dot clears
once the relay is open and verified.

A muted channel — notify mode "off" — does not light the active cloud's dot, its place's
dot, the window title or the OS badge (`placeUnreadCounts`). A "mentions only" channel lights
those four with its unread mentions, capped at its unread messages; the rule lives in
[`../chat/notifications.md`](../chat/notifications.md), which also lists what the device-local
mentions inbox cannot know. All four mean "something here wants
you", and a channel told to stay quiet does not; its own sidebar row still shows its unread. They
used to count it, so one muted channel kept its place and its cloud dotted with nothing to act on.
The mode is the one the row's bell-off glyph reads (`channelNotifyMode`), so the dots follow a mute
set on this device at once. A mention in a muted channel is still captured into the Mentions entry while the app is running,
whatever the mode; one that arrived while the app was closed lights none of the four.
The pending push on another cloud is not filtered this way: it is marked on any push that arrives.

## An invited cloud this device lost

An invited cloud has no server-side list. Its durable record is the local cache row (`cloudType:
'invited'`) the invite flow writes — the joined-clouds store beside it only bridges the moment before
that row lands — so a reinstall, a cleared cache, or a profile that never ran
that flow has no row for it, and nothing can refill the list. What can be repaired is a cloud the
app is told about by name: `runtime.data.recoverInvitedCloudIfMissing` asks the relay for a fresh
delegation token for that cloud (`delegate-cloud`), which carries its endpoints, and writes the row
back. It does nothing when the row is already there, and a revoked grant just leaves the rail as it
was. The row comes back without a name, so the row reads as the cloud's id until the cloud is
entered and its name is fetched over its own socket.

Three places name a cloud, and each one recovers it:

- **A push.** `usePushInvitedCloudRecovery` reads the source cloud from the push (`data.cid`, which
  the shell flattens to the top level) on every push that arrives, not only the ones that show a
  notification. The notification is skipped for a muted channel, an own message, a silent push or
  Do Not Disturb, and the lost cloud needs its endpoints back all the same. A burst of pushes for
  one cloud makes one relay call, not one per push. It runs only in the desktop shell and only
  while signed in.
- **A switch.** `useCloudSwitchFlow` recovers the target before it switches, so a push tap, a rail
  click or an account page into a lost cloud opens it instead of failing for want of endpoints. A
  failed recovery does not stop the switch, which then reports its own failure (see below). Until
  the switch itself starts, `isSwitching` is still false, so the flow holds its own guard for the
  whole run and a second click while the recovery is out is ignored.
- **The active cloud.** `useInvitedCloudRecovery` writes the row for the cloud the session is
  inside, once its socket verifies, and fetches the name that the other two leave out.

Owned clouds are skipped by all three: the relay catalog is their record, and an invited row for
one would mislabel it. That check reads the catalog as currently loaded, so while the first read is
still out, or after it failed, an owned cloud can be written as invited. The rail still shows it as
owned once the catalog arrives, because a catalog entry wins over a cached one. Pushes that came
through the relay rather than a cloud carry `#` instead of a cloud id. Every push reader turns that into
the relay's `default` (`pushCloudIdOf`), which is never recovered, and switching to it leaves the cloud
instead of asking `delegate-cloud` for a delegation. The switch flow reads a stray `#` the same way,
since a delegation to `#` only ever answers "cloud not found".

## A failed switch

`useCloudSwitchFlow` (`shared/hooks/useCloudSwitchFlow.ts`) switches with `switchCloud`, which rolls
its own session back on failure. The toast now says why, from the error's wire text
(`switchCauseKey`, over `classifyWireError`):

| Cause             | Toast says                              |
| ----------------- | --------------------------------------- |
| network           | the server could not be reached         |
| denied or expired | you no longer have access to this cloud |
| not found         | this cloud no longer exists             |
| anything else     | the cloud did not accept the switch     |

Under that line the toast shows the server's own words (`toastFailure`), so a refusal can be
reported as it was given.

The toast offers Try again only for a network failure or an unrecognised one, where a second
attempt can land. A refused cloud refuses again, and a refusal is how a lapsed subscription shows
up, so that toast points at the mobile app instead; a cloud that no longer exists gets neither.
Try again calls the latest `switchCloud` through a ref, not the closure
from the moment of failure. By the time it is pressed, the reader may already be on that cloud, or
another switch may be running, and the stale closure would skip both guards and drop the open channel.
It used to say only "Couldn't switch cloud".

## Removing a cloud, and a failed delete

The switcher's **Remove cloud** item opens a list of the clouds that can be removed; picking one asks
first. An invited cloud is only forgotten on this device. An owned cloud is
deleted on the backend (`useRemoveCloud`, `releaseCloud` with `cascade`) after a confirm dialog.

An owned cloud that cannot be opened as it is is not in that list (`canDelete`). The delete
releases the cloud on the server with everything in it, and these are the clouds the user cannot enter
to see what they would lose. The set is the states the row labels (`STATUS_KEY`): `reserved` and
`init` (still being set up), `error`, `suspended` and `expired`. Any other status, or none, keeps the
delete. Home is never in the list, and when no cloud can be removed the item is not drawn. An invited
cloud keeps its local removal in every state, since forgetting
it on this device loses nothing on the server.

A delete that fails keeps the dialog open and says why inside it (`deleteCauseKey`, over
`classifyWireError`). It used to stay open with nothing said:

| Cause   | The dialog says                      |
| ------- | ------------------------------------ |
| denied  | only the cloud's owner can delete it |
| network | the server could not be reached      |
| other   | the cloud was not deleted, try again |

A cloud that was already released is not a failure. The backend answers a release of an expired
cloud with `409 CONFLICT - already expired` (and a missing one with `404`), which
`classifyWireError` reads as `expired` and `notFound`. Retrying can only fail the same way, and the
switch wording for `expired` ("you no longer have access") would be wrong for someone deleting it,
so `isCloudAlreadyGone` takes both out of the failures (an `expired` counts only with the 409, since an
expired token reads as `expired` too, and a 404 only when it names the cloud; both others are reported): the hook still forgets the cache row and
refreshes the list, the dialog closes, and a toast says the cloud had already ended. A cloud whose
subscription lapsed is also `expired` on the backend, so its row can stay in the switcher, labelled
"(expired)", after this toast; that row is the list as the backend has it, and it cannot be removed
(see above). The toast is for a cloud that looked open but had been released in the meantime.

## When the cloud list cannot be loaded

Owned clouds come from the relay catalog (`useCloudSessionCatalog`); invited ones do not. When that
read fails, `isCloudsError` is true, and the owned clouds used to drop off the rail with nothing to
say they had not loaded. The switcher's menu then ends the cloud list with a reload item that says the
list could not be loaded. It retries the read (`refetchClouds`) and keeps the menu open, and it stays,
disabled and spinning, while the retry runs: the
failure is reported until a read succeeds, not only while no read is in flight.

A failed read is also read again without the item being pressed, once each time the relay socket
is verified. The read goes out as soon as a stored session exists, which at start-up or after sleep can
be before that socket has finished its handshake. The catalog is relay-signed HTTP, the signing
credential lives about an hour, and a lapsed one is renewed only through the relay socket — so a read
sent in that window fails on a session that is healthy a few seconds later, and the rail would keep
a reload item that one press clears. `useCloudSessionCatalog` re-reads when the socket verifies
after a failure, or when a read fails with the socket already verified. If that re-read fails too,
the item stays until it is pressed or the socket verifies again (after a drop or a wake); the hook
does not retry on a timer. One case adds a read: a component that mounts while the failure stands
reads on mount as every consumer does, and when that fails it is a new failure to that component, so
it is re-read once as well. That is bounded by the number of mounts, not a loop.

The rows stay as they are. react-query keeps the last good list when a refresh fails, so a cloud
that was shown keeps showing, and the reload item says the list may be out of date. Only a first
read that fails leaves the owned clouds out, and then the reload item is the only sign.
