# ADR-0347: A mini app reads only the place its view opened on

> Status: Accepted · Decided: 2026-11-18 · Implemented: `feat/mini-app-place-bound-reads`
> · Scope: `libs/runtime-core` (`SUB_WEB_VIEW_REPOSITORY_WHITELIST`, the `currentPlaceKey` guard,
> `roomInCurrentPlace`, `answerRoomInCurrentPlace`) · `libs/bridge-messages` (refusal reason
> `otherPlace`) · `apps/mobile/src/app/subWebView/subWebViewRuntimeBridge.ts` · `libs/chatic-apps-sdk`
> (typed methods, place profile helpers)
> · The specification is [apps/mobile docs/webview/mini-app-protocol.md](../../apps/mobile/docs/webview/mini-app-protocol.md#runtime-reads)
> · Related: [ADR-0320](./0320-a-sub-webview-page-reads-the-current-cloud-through-a-whitelist-of-runtime-requests.md)
> (the reads), [ADR-0325](./0325-a-sub-webview-page-may-send-a-text-message-to-a-room-of-its-place.md)
> (the send held to its place), [ADR-0345](./0345-a-sub-webview-page-gets-no-runtime-requests-where-the-webview-cannot-tell-its-frames-apart.md)

## Context

A mini app is opened in one place of a cloud, and DoU's own screens read one place at a time: the
rooms, members and place profiles of the place the user is in. The runtime reads ADR-0320 opened were
bound to the cloud only. A page could read any place's rooms, messages, members and profiles, and any
user row of the cloud by its id. The one write, ADR-0325's text send, was already held to the place the
view opened on, checked against the room the message names.

That gap made a page reach further than the screen it was opened from, and further than the consent
question says: the user agrees in one place and the page reads them all.

## Decision

1. **Everything of a place is read only in the place the view opened on, while the session is still
   there.** The shell passes the whitelist that place as the scope's place only while the session's
   committed place is it; once the user moved, every read of a place is refused until a new view
   opens there. The places themselves (`place`) and the cloud's own row (`cloud`) are the cloud's,
   not a place's, and stay open.
2. **Each read names its place one of four ways**, checked as the shape allows:
    - a list by its query's `sid` (`channel.observeList`, `cacheReadList`, `fetchList`;
      `profile.observeList`, `cacheReadList`), which must be present and the opened place's
      (`currentPlace`);
    - a place profile by its key, `<place>@<user>` (`profile.observeItem`, `cacheRead`), which must
      begin with the opened place's id (the new `currentPlaceKey` guard);
    - a room's reads by the room (`channel.observeItem`, `cacheRead`; `join`'s lists; `chat.observeList`,
      `cacheReadList`, `observeFeedCoverage`, `listPendingImageChats`; `chat.observeLastList`, every id;
      `user.observeList`, `cacheReadList`), which the shell reads from the device cache before the
      request goes, as it does for a message's room (`roomInCurrentPlace`, now with `each` and with a
      bare id argument);
    - a message by its id (`chat.cacheRead`), which names no room: the shell checks the room of the
      message the runtime answered (`answerRoomInCurrentPlace`), and `null` passes.

    A read that fails its check is `RUNTIME_NOT_ALLOWED` with reason `guard`.

3. **A user row by its id is closed** (`user.observeItem`, `user.cacheRead`, reason `otherPlace`). A
   user row is the cloud's, not a place's, and nothing in its id says which place's member it is. A
   page names a place's members by their place profile, which is how DoU names them, lists a room's
   users with `user`'s lists and the place's members with `user.listPlaceMembers`.
4. **The SDK follows.** Its typed methods drop the two user reads, and its place profile helpers
   (`placeProfile`, `placeProfiles`, `myProfile` and their `observe…`) read the session's place only,
   without the `placeId` option ADR-0345's change gave them.

## Alternatives

- **Keep reads cloud-wide and bind only the send.** What ADR-0320 and ADR-0325 left. Rejected: a page
  opened in one place reaches every place's members and messages, which is more than its screen shows
  and more than the user agreed to in that place.
- **Filter answers instead of refusing requests.** Read anything, then drop rows of other places. It
  would work for lists, but a stream would have to filter each event, and a page would get a silently
  shorter list instead of a refusal it can explain. The whitelist refuses by request elsewhere; it does
  here too, with one answer check for the read that names no room.
- **Keep user rows by id, limited to the place's members.** It needs the place's member list on every
  read, a server read the cache cannot answer. The place profile already names a member, so the read
  is closed instead.
- **Let a page name another place it is a member of.** Rejected: the page was opened in one place, and
  a new view in another place is how it reads there, as a message already works.

## Consequences

- A page that read other places, or user rows by id, is refused where it was answered. Nothing outside
  DoU had shipped a page that does.
- Every read of a room costs one more cache read in the shell, and `chat.observeLastList` one per room
  it names.
- A room the device does not hold cannot be read even in the opened place: its check finds no room. A
  page reads the place's rooms from its lists first, as DoU's screens do.
- The consent question can now say "this place". Its wording is a separate change.
