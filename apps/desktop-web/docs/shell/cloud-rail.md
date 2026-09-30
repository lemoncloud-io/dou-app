# Cloud rail

The leftmost column: one 48px tile per cloud (`CloudRail`, `features/chat/components/CloudRail.tsx`).
The Home tile is the Default Cloud. The active tile is black in both themes (`--tile-active`) with a
lime ring and a lime initial.

## Names

A tile is named with `cloudLabel` (see [`../chat/room-names.md`](../chat/room-names.md)). A cloud with
no name, or with the server's generated setup name (`#cloud/<n>/<n>`), reads "Untitled cloud". A
cloud whose setup failed says "(setup failed)" in its label, before a click on it fails. The Home
tile's name is a UI string (`cloud.home`), so it reads "홈" in Korean rather than a literal "Home".

`cloudTiles` (`shared/utils/tileInitials.ts`) turns the names into tile text. A tile shows one
letter, and only tiles that would read the same take more: first the name's trailing number, then
its second letter, so "test-lemon" and "test-lemon2" read "Te" and "T2", and "Team" and "Tokyo" read
"Te" and "To". An untitled cloud has no letters of its own and reads "?"; when there are several,
they are numbered in both the tile ("?1", "?2") and the label ("Untitled cloud 2"). Before this,
two untitled tiles both read the fallback label's first two syllables.

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

The toast offers Try again. Try again calls the latest `switchCloud` through a ref, not the closure
from the moment of failure. By the time it is pressed, the reader may already be on that cloud, or
another switch may be running, and the stale closure would skip both guards and drop the open channel.
It used to say only "Couldn't switch cloud".
