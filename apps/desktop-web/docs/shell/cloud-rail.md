# Cloud rail

The leftmost column: one 48px tile per cloud (`CloudRail`, `features/chat/components/CloudRail.tsx`).
The Home tile is the Default Cloud. The active tile is black in both themes (`--tile-active`) with a
lime ring and a lime initial.

## Names

A tile is named with `cloudLabel` (see [`../chat/room-names.md`](../chat/room-names.md)). A cloud with
no name, or with the server's generated setup name (`#cloud/<n>/<n>`), reads "Untitled cloud". A
cloud that cannot be opened as it is says why in its label, before a click on it fails: "(setup
failed)", "(setting up)", "(suspended)" or "(expired)". The Home
tile's name is a UI string (`cloud.home`), so it reads "홈" in Korean rather than a literal "Home".

`cloudTiles` (`shared/utils/tileInitials.ts`) turns the names into tile text. A tile shows one
letter, and only tiles that would read the same take more: first the name's trailing number, then
its second letter, so "test-lemon" and "test-lemon2" read "Te" and "T2", and "Team" and "Tokyo" read
"Te" and "To". An untitled cloud has no letters of its own and reads "?"; when there are several,
they are numbered in both the tile ("?1", "?2") and the label ("Untitled cloud 2"). Before this,
two untitled tiles both read the fallback label's first two syllables.

## A cloud that cannot be opened

A tile whose cloud is not `active` has a dashed edge and muted ink at full opacity. It used to sit
at 50% opacity, which took its initial well under text contrast.

A suspended or expired cloud is one its subscription no longer keeps open (`isLapsedCloud`). Only a
subscription reopens it, and desktop sells none: subscriptions and new clouds are in the DoU mobile
app. So its hint says that under the name, and a click does not try to switch. It shows a toast
with the same line and the App Store and Google Play links (`MobileAppPointer`) instead. A switch
into it used to be refused and then offer Try again, which could never work.

## Renaming a cloud

The tile's context menu (right-click or the Menu key) offers "Rename cloud" only on the cloud you
own and are in right now (`canRename`), never on Home, an invited cloud, a lapsed one, or an owned
cloud you are not in. `cloud.update` goes out on the active slot's socket, so renaming another tile
would send its id down this cloud's connection and write its row into this cloud's cache; apps/web
likewise edits only the active cloud. Names are 2 to 30 characters, as on web. It opens
`RenameCloudDialog`, a one-line field shaped like `RenameChannelDialog`. `useRenameCloud`
(`shared/hooks/useRenameCloud.ts`) writes through `CloudRepository.updateCloud`, which also rewrites
the cached cloud row, and patches the new name into the relay catalog query the owned tiles read.
The tile and its label change at once, without waiting for the broker list to catch up.

A tile's name has two sources, and for an owned cloud the local one wins. The relay catalog lists
the cloud with a name that can lag a rename by a while, so after a reload it may still show the old
one. A rename also writes the new name into the local cloud cache (one global partition, kept across
reloads), which `useClouds` observes: when that row carries a name, the tile uses it instead of the
catalog's. With no cached name the catalog's name stands, and an invited cloud keeps reading only
its own cache row. The cache row is overwritten when `cloud.get` runs for that cloud, which the
app does only to refresh an invited cloud's name.

## Unread

The active cloud's dot comes from the live socket. Another cloud's dot is a pending cross-cloud push
(`useCrossCloudPushBadge`), the only signal the client has for it, and it carries no count.

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

The toast offers Try again only for a network failure or an unrecognised one, where a second
attempt can land. A refused cloud refuses again, and a refusal is how a lapsed subscription shows
up, so that toast points at the mobile app instead; a cloud that no longer exists gets neither.
Try again calls the latest `switchCloud` through a ref, not the closure
from the moment of failure. By the time it is pressed, the reader may already be on that cloud, or
another switch may be running, and the stale closure would skip both guards and drop the open channel.
It used to say only "Couldn't switch cloud".

## Removing a cloud, and a failed delete

A tile's menu removes it. An invited cloud is only forgotten on this device. An owned cloud is
deleted on the backend (`useRemoveCloud`, `releaseCloud` with `cascade`) after a confirm dialog.

An owned cloud that cannot be opened as it is has no delete in its menu (`canDelete`). The delete
releases the cloud on the server with everything in it, and these are the clouds the user cannot enter
to see what they would lose. The set is the states the tile labels (`STATUS_KEY`): `reserved` and
`init` (still being set up), `error`, `suspended` and `expired`. Any other status, or none, keeps the
delete. When nothing is left in a tile's menu (Home, or such a cloud) no menu is rendered, so the
right-click opens nothing. An invited cloud keeps its local removal in every state, since forgetting
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
subscription lapsed is also `expired` on the backend, so its tile can stay on the rail, labelled
"(expired)", after this toast; that tile is the list as the backend has it, and it has no delete to
offer (see above). The toast is for a tile that looked open but had been released in the meantime.

## When the cloud list cannot be loaded

Owned clouds come from the relay catalog (`useCloudSessionCatalog`); invited ones do not. When that
read fails, `isCloudsError` is true, and the owned clouds used to drop off the rail with nothing to
say they had not loaded. The rail now ends with a dashed reload tile (the look of a cloud that cannot
be opened), whose label says the list could not be loaded and some clouds may be missing. It
retries the read (`refetchClouds`), and stays on the rail, spinning, while the retry runs: the
failure is reported until a read succeeds, not only while no read is in flight.

A failed read is also read again without the tile being pressed, once each time the relay socket
is verified. The read goes out as soon as a stored session exists, which at start-up or after sleep can
be before that socket has finished its handshake. The catalog is relay-signed HTTP, the signing
credential lives about an hour, and a lapsed one is renewed only through the relay socket — so a read
sent in that window fails on a session that is healthy a few seconds later, and the rail would keep
a reload tile that one press clears. `useCloudSessionCatalog` re-reads when the socket verifies
after a failure, or when a read fails with the socket already verified. If that re-read fails too,
the tile stays until it is pressed or the socket verifies again (after a drop or a wake); the hook
does not retry on a timer. One case adds a read: a component that mounts while the failure stands
reads on mount as every consumer does, and when that fails it is a new failure to that component, so
it is re-read once as well. That is bounded by the number of mounts, not a loop.

The tiles stay as they are. react-query keeps the last good list when a refresh fails, so a cloud
that was shown keeps showing, and the reload tile says the list may be out of date. Only a first
read that fails leaves the owned clouds out, and then the reload tile is the only sign.
