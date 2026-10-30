# ADR-0258: Invite candidates come from the place member list, with profiles loaded by id

> Status: Accepted · Decided: 2026-10-13 · Implemented: `feat/place-members`
> · **Narrows** [ADR-0072](./0072-desktop-channel-member-add-and-join-cursor-placement.md) decision 1 and
> [ADR-0075](./0075-web-channel-member-add-from-place.md) decision 2: the roster union they chose is now the
> failure fallback, not the pool
> · Related: [ADR-0085](./0085-sid-is-a-value-not-a-cache-scope-axis.md) (a `profile.sync` row is filed under the
> place the caller names) · [ADR-0166](./0166-place-invite-is-a-lab-experiment-off-until-a-device-turns-it-on.md)
> (the place invite stays a Lab experiment; this removes the reason it gave, not the switch)
> · Scope: `libs/data` (`UserSocketDataSource.fetchPlaceUsers`, `UserRepository.listPlaceMembers`,
> `ProfileRepository.syncProfilesOf`, `toDomainPlaceMember`) · `libs/app-runtime` socket factory ·
> `apps/desktop-web` and `apps/web` `useInviteCandidates`, `AddMembersDialog`, `PlaceInviteTab`
> · The module docs are [libs/data repositories/domains.md](../../libs/data/docs/repositories/domains.md),
> [apps/web channels/invite.md](../../apps/web/docs/feature/channels/invite.md) and
> [apps/desktop-web chat/channel-settings.md](../../apps/desktop-web/docs/chat/channel-settings.md)

## Context

Three pickers offer "people in this place": desktop's "Add members" and "New message", and the web
invite page's "Place members" tab. The server had no way to list a place's members, so each picker
built its pool from the rosters of the rooms I am in. Two kinds of member never appeared:

- somebody with **no room at all** — which is exactly what the web place invite produces: the person
  is a member from the moment they are invited, and the owner then could not find them to put them
  in a room. That is why the place invite was left behind a Lab switch;
- somebody whose rooms are **all rooms I am not in**.

The server now offers two things (`@lemoncloud/chatic-sockets-lib` 0.5.7, `-api` 0.26.906):

- **`place.list-user { id, limit?, page? }`** → `{ list, total, page, limit }`, each item
  `{ id, name?, nick?, photo?, isOwner? }`. A member is anyone the place has given a role to, plus its
  owner — people with no room and invitees who have not accepted included. A non-member gets `403`,
  an unknown place `404`. `limit` defaults to 10. The server cuts the page from its member index and
  then drops anyone who has left, so a page can be shorter than `limit`, and `total` — counted before
  the drop — can be larger than the real count. `photo` is the user's own picture; the client's
  picture field everywhere else is `thumbnail`.
- **`profile.sync({ userIds })`** — the existing profile delta call, now able to name its users. The
  answer has the same shape (`{ profiles: { uid: profile | null }, syncedAt }`). It still answers
  for **the place the socket session is on**, whatever the caller has in mind, and without `userIds`
  it still answers for the members of my rooms.

Pictures and profile thumbnails are each up to 50 KB and a socket answer is capped at 128 KB, so a
place cannot be read in one call, and neither can its profiles.

## Decision

1. **The list is a user read.** `place.list-user` joins the `user` gateway bundle as `listPlaceUser`
   (`listUser` already names the channel roster there), `UserSocketDataSource.fetchPlaceUsers` reads
   one page, and `UserRepository.listPlaceMembers` reads them all. A call's bundle is chosen by what
   it answers, not by its wire module — `channel.list-user` sits with users, and `user.my-site` sits
   with places — so the place's members sit with users too. The data source maps each item to a
   `DomainPlaceMember` carrying only the listed fields, `photo` moved to `thumbnail`. `isOwner` is on
   that shape and nowhere else: it is per place, and the user cache is per cloud.
2. **Read until an empty page or `total`, never until a short page.** Pages run from 0. A page that
   adds nobody new also ends it, so a server that ignores `page` cannot loop the client.
3. **Each page's profiles are loaded by id, on the session's place only.** After each page,
   `ProfileRepository.syncProfilesOf(ids, placeId)` sends `profile.sync` with those `userIds` — never
   more than one page's worth, so list and profiles share one size budget — and stores the answer
   through the same path as the delta sync (upsert, `null` deletes). It runs only when the caller
   says the session is on the listed place (`sessionPlaceId === placeId`), and callers pass `null`
   while a place or cloud switch is in flight. The rows are filed under the place the caller names;
   asking while the session is elsewhere would file that other place's profiles under this one. The
   loads run alongside the paging, and each first checks the repository is still on the cloud the
   list was asked in, since an answer is filed under the cloud current when it is sent. A failed
   profile load does not fail the list. On the web, a pool from the list registers no per-person
   profile bootstrap or poll on top — that would be a request per member of the place.
4. **The by-id load has no cursor.** It sends no `since`, and `syncProfilesOf` returns no `syncedAt`.
   The background delta sync keeps the only cursor, and it follows my rooms' members; storing a
   by-id answer's cursor there would make it skip their changes until they changed again. Members the
   background sync does not cover are brought up to date by reading them in full each time a picker
   opens.
5. **The list is returned, not cached.** It is read when a picker opens and handed back with the
   `{ cid, sid }` it was asked for, so a caller drops an answer that outlived its scope. Membership
   changes on the server without a push, and a cached roster of a place would keep showing people
   who left. This is an exception to "reads come from a local stream", like `listRelayUsers`; the
   profiles it loads do go through the cache, and that is what the pickers name people from.
6. **Pool = place members − the target's members − me; the roster union is only the fallback.** The
   target's members are excluded from both sources the pickers already used — the room's
   `memberIds` and its roster — and "me" is both my id in this cloud and the session's user id. When
   the list fails (a `403`, or a cloud whose server does not have the action) the pool is the old
   roster union, which holds only people I already share a room with and so can show no one I could
   not see anyway. The two are never merged: a list that worked is not padded with rosters, and the
   fallback is not padded with list rows. While the socket is unverified, nothing is fetched and the
   cached union is served, as before.
7. **Pending invitees are not marked apart.** The server has nothing to tell them by, and being able
   to put someone in a room straight after inviting them is the point.
8. **Names follow the place profile, then the user's own.** Every picker shows the place profile's
   nick and picture when there is one, else the user's own name and picture from the list (web) or
   user record (desktop). Desktop's "Add members" drew only the user record until now; it takes the
   same merge as "New message", or a member who shares no room with me would read by their account
   name while every other surface names them by their place nick.

## Consequences

- A place-only invitee, and a member who shares no room with me, can be added to a room and messaged
  from desktop and from the web invite page. The web place invite's Lab switch can come off once
  this has been seen to work end to end on servers that have shipped the list; that is a separate
  change.
- Opening a picker costs one request per ten members plus one profile request per page, where it
  used to cost one roster request per room (desktop) or nothing (web). The web tab now waits for the
  list before showing anyone, instead of drawing from the cache at once.
- On a cloud whose server has not shipped the list, every picker falls back and behaves as before.
- A member just added to a place can be missing from the list for a moment: the server's member index
  is updated from a stream.
- Desktop's sidebar still derives a place's members from my rooms (`placeMemberPeers`); only the
  pickers read the list. A 1:1 started with a member I share no room with is listed in the place it
  was started in.
- If the server one day takes a place on `profile.sync`, the session-place check in decision 3 can go.
- If the answer size limit is hit in practice, the page size is lowered for list and profiles
  together — `listPlaceMembers` takes `pageSize`.
- The pickers' copy still speaks of "your other channels"; it is product wording, left to a separate
  change.

## Alternatives

- **List under `PlaceSocketDataSource`.** The call's wire module is `place`, but the bundle and data
  source a call joins are chosen by what it answers, and every other user-shaped read is on the user
  side. Putting it under Place would have made the Place source map users.
- **Merge the list with the roster union.** The union adds nobody a working list leaves out, except
  people the server no longer counts as members — the ones it should not show.
- **Keep the list in the user cache.** The user cache is per cloud and holds chat authors and roster
  members alike; a place's membership written there could not be told apart or pruned, and the
  `isOwner` flag would land on a cloud-wide row.
- **Load profiles with the background sync's cursor**, or add the listed members to the background
  sync. The first skips my rooms' members' changes (decision 4). The second makes every tick ask for
  every member of every place I have opened a picker in, for people I may never look at again.
- **Ask for profiles regardless of the session's place** and trust the answer. The answer names no
  place, so there is nothing to check it against (decision 3).
