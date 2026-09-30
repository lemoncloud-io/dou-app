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
