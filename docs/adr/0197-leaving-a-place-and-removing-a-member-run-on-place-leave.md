# ADR-0197: Leaving, deleting and removing a member — `place.leave` and `place.delete` from the place information and member screens

> Status: Superseded in part by [ADR-0238](./0238-a-member-is-removed-from-a-room-profile-by-scope.md) —
> decision 5's "only removal entry point" · Decided: 2026-10-13 · Implemented:
> `feat/place-leave-and-remove` (data layer and `apps/web`; `apps/desktop-web` follows in a separate change)
> · **Closes** the gaps [ADR-0095](./0095-place-detail-read-only-screen.md) deferred (no Leave place),
> [ADR-0139](./0139-an-owner-invites-into-a-place-without-a-room.md) recorded ("there is still no way to leave a
> place") and [ADR-0166](./0166-place-invite-is-a-lab-experiment-off-until-a-device-turns-it-on.md) gave as one
> reason for the Lab switch ("a member cannot leave a place"). The switch itself is not changed here.
> · Related: [ADR-0258](./0258-invite-candidates-come-from-the-place-member-list.md) (the place member list this
> screen reads) · [ADR-0067](./0067-rejoin-hides-prior-messages.md) (what a left room loses) ·
> [ADR-0185](./0185-desktop-place-management-is-limited-to-admins.md) (desktop's admin menu, left as it is)
> · Scope: `libs/data` (`PlaceSocketDomainGateway`, `PlaceSocketDataSource.leavePlace` / `getPlace`,
> `PlaceRepository.leavePlace` / `removeMember` / `isPlaceDeleted` and its list snapshot,
> `ChannelRepository.evictLeftChannels` / `dropMemberFromChannels`) · `libs/app-runtime` socket factory and `session.clearSiteSelection` ·
> `apps/web` `features/place`, `features/home`
> · The module docs are [libs/data repositories/domains.md](../../libs/data/docs/repositories/domains.md),
> [libs/data remote/socket.md](../../libs/data/docs/remote/socket.md),
> [apps/web place/README.md](../../apps/web/docs/feature/place/README.md) and
> [apps/web home/README.md](../../apps/web/docs/feature/home/README.md)

## Context

The product rule has always been that a place you were invited into is one you can leave but not
delete, and that its owner decides who stays. Neither could be built: the server had no action for
either. The web app's empty room list even told an invited member "you can leave this place" and
pointed at a settings hub with no such row.

The server now offers one action for both (`@lemoncloud/chatic-sockets-lib` 0.5.7 /
`-api` 0.26.906 — already the app's versions):

- **`place.leave { id, userId? }`** → `{ siteId, leftChannelIds, failedChannelIds }`. With `id` alone
  the caller leaves the place; with `userId` as well the place's owner removes that member. Either
  way the server drops the place membership, takes the person out of every group room of the place,
  and lists the rooms it took them out of. `failedChannelIds` are rooms it already counted them out
  of. It refuses (`403`) an owner leaving their own place, a non-owner removing someone, and anyone
  removing the owner. If the membership goes but some room clean-up fails, the call fails, and
  repeating it redoes only the clean-up.

ADR-0258 had already brought the place's member list (`place.list-user`) into the data layer, so a
screen listing everyone in a place — people with no room included — became possible at the same
time.

## Decision

1. **One action, two repository calls.** `PlaceRepository.leavePlace(id)` and
   `removeMember(id, userId)` both send `place.leave`; they differ only in what they do to the cache.
   The answer types are the server package's (`PlaceLeaveResult`), not redeclared.
2. **Not optimistic.** Both wait for the server. A leave the server refuses (the owner) would
   otherwise make the place vanish, move the session out of it, and then put the row back without
   moving the session back — the reason the place delete is not optimistic either.
3. **The rooms to clear are the server's list.** After a leave, `ChannelRepository.evictLeftChannels`
   gives each room in `leftChannelIds` exactly what a confirmed self-leave of that room gets — row
   removed, the short leave guard set so an in-flight snapshot cannot restore it, messages purged —
   through the same code `leaveChannel` now shares. The app does not pick "the cached rooms of this
   place" itself: a cached row's place tag can be stale, and the server's list is what actually
   happened. Then the place row is dropped, the last one included, because an empty list snapshot
   deliberately leaves the cache alone and nothing else would remove it.
4. **A removal corrects rosters only.** `dropMemberFromChannels` takes the member out of the cached
   `memberIds` of the listed rooms, skipping rooms this device holds no row for, and the place row
   stays. `failedChannelIds` are logged and treated as success in both calls. All cache work happens
   in the `{cid, uid}` scope the request was made in.
5. **Removal lives on a member screen open to every member.** A new place member screen lists
   everyone `place.list-user` returns, for anyone in the place. Only the place's owner (the place row's
   `isOwner`, as on every other place screen) gets a Remove button, on every row but their own and the
   owner's. This screen is the only removal entry point. A room's member list keeps its kick, which is
   a narrower thing: one room, checked against that room's owner, and only for people in rooms I am
   in.
6. **The member list is read each time and never cached, nor replaced.** It is read on every open and
   dropped if its `{cid, sid}` no longer matches the screen. After a removal the row is taken out of
   the list on screen and the list is not re-read: the server's member index updates from a stream, so
   a read straight after could show the person again. When the list cannot be had the screen shows an
   error and a retry. It does not fall back to the union of my rooms' rosters as the invite pickers do
   — on a screen that manages membership, a list that is not "the members of this place" is wrong, not
   approximate.
7. **Leave and delete sit at the foot of the place information screen, as the design draws them.**
   One red row under a block divider: Leave for anyone but the owner, Delete for the owner. Leave asks
   first — every chat room goes with it, and coming back takes a new invite. The relay's own place,
   which is a system place, and guests get neither, nor the member screen. The settings hub keeps only
   the Members row. On desktop, where the place rail's tile menu is only for admins today, a place I do
   not own gets a menu too, with place settings and Leave; the admin menu's own rule is untouched.
8. **After leaving, the user goes to DoU Home.** A one-button notice says the leave is done and that
   DoU Home is next; its OK leaves the cloud session for the relay. The design sends the user there
   whatever else the cloud holds, rather than picking another of its places. A place that leaves the
   list some other way (a removal, a delete) still goes through home's fallback to the cloud's first
   place, and with none left the selection is emptied without a switch
   (`runtime.session.clearSiteSelection`) and home shows the cloud with no place.
9. **The owner deletes from the web too.** The confirm lists the place's group rooms and their member
   counts, as this device holds them, then sends `place.delete`. Afterwards home moves to the cloud's
   next place.
10. **A deleted place is a stamped row, and a member is told.** The server's delete is soft: the row
    gets `deletedAt` and keeps being listed, to members as to the owner, and no event goes out. The
    place list therefore drops stamped rows and prunes their cache — which also removes deleted places
    that had been showing until now. When the selected place drops out of a member's list, the app
    asks `place.get` about it: 404 or a stamped row means deleted, and only then does the member get
    "this place was deleted", whose OK goes to DoU Home. A place the member left or was removed from
    still answers with its row and gets nothing; a place the user owned is never asked about.

## Consequences

- An invited member can leave from the web app, and the empty room list's "you can leave" hint now
  leads somewhere that does it. The owner can see and remove anyone in the place, including people in
  no room — the gap ADR-0139 named and ADR-0166 cited.
- Leave, delete and the deleted-place notice follow the design. The member screen and its removal have
  no design yet and reuse existing patterns; they are flagged for review.
- The server's delete is soft and leaves the place's rooms in place, so the delete confirm says what
  members lose — the place and its rooms are out of everyone's reach, for good — rather than the
  design's first wording, which said the rooms and messages are deleted.
- A member learns that their place was deleted with the next place list refresh, wherever they are in
  the app — there is no push.
- A removed member's app learns of it on its next place list refresh, not at once — there is no push.
- Re-inviting a removed or departed person is allowed by the server and brings them back.
- Opening the member screen costs one request per ten members plus their profile loads, every time.
- Desktop gains the same screen, rail menu and settings row in a follow-up change; until then Leave is
  web-only.

## Alternatives

- **Remove a member from a room's member list.** Already a kick menu there, it would only reach people
  in rooms I am in, and would put two different scopes behind one tap.
- **Clear the cached rooms whose place tag matches.** Simpler than reading the answer, but a stale tag
  either leaves a room behind or clears one the server did not touch.
- **Optimistic leave**, like a room leave. The refusal case is the owner, which the UI already hides,
  but a hidden-but-reachable path (a stale screen, a role change) would flash the place away and back
  and strand the session.
- **Fall back to the roster union on a failed member list**, as the invite pickers do. Rejected for
  the reason in decision 6.
- **Stay in the cloud after leaving** — move to another of its places, or its empty home. This was the
  first version of decision 8. The design sends the user to DoU Home instead, with a notice that says
  so, and the notice is the same one a deleted place ends on.
- **Tell a deleted place from a removal by the list alone.** A stamped row does say "deleted", but the
  list drops it, and the member's app may never have seen the stamp before the row went. Asking about
  the one place that vanished is a single request, made only when it matters.
