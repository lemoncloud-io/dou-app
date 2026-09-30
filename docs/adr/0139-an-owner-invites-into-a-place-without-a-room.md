# ADR-0139: An owner invites into a place without a room, and the session names the place

> Status: Accepted · Decided: 2026-09-29 · Implemented: `feat/place-invite`
> · Scope: apps/web `features/invite` (`PlaceInvitePage`, `CloudInviteAccept`'s
> target kind) · `app/utils/placeInviteGate` · home profile menu · `useCreateInviteBatch.createPlaceInvite`
> · Builds on: [ADR-0016](./0016-invite-accept-popup-web-ui-kit.md) (the cloud invite accept screen),
> [ADR-0075](./0075-web-channel-member-add-from-place.md) (there is no place member list)
> · The module doc is [apps/web/docs/feature/invite/place-invite.md](../../apps/web/docs/feature/invite/place-invite.md)

## Context

Until now a person reached someone else's cloud place in one way only: the owner of a group room
invited them into that room, and the place came along with it. There was no way to bring someone
into a place first and decide on rooms later — the order an owner setting up a new place actually
works in.

The wire already allows it. `user.invite` takes `{ name, phone, channelId? }`, and `channelId` is
optional. It has no site field, though, so the open question was what the server does with an
invite that names no room. It was measured on the dev servers: an owner session sitting on one of
its places sent `user.invite` with no `channelId`, and a fresh guest on a second origin accepted it.

- `user.invite:ok` came back with `siteId` and `site$` set to **the site the session was on**,
  `channelId: ""`, and `cloudId`/`cloudName` filled in by the server.
- The same response already carried the invitee's cloud `userId`, and the member role row
  `<uid>@<sid>` seen after acceptance had been created at the moment of issue. **The server makes
  the invitee a place member when the invite is issued, not when it is accepted.**
- The invite metadata the recipient reads (`GET /hello/invite-code`) carried the same `siteId`.
  After acceptance `auth.switch` into `<uid>@<sid>` succeeded, `user.my-site` listed that one place
  with `isOwner: false`, and home rendered the existing "invited, no rooms yet" empty state. No
  place profile was asked for.

So the backend needed no change. What was missing was an entry point, a form, and an accept screen
that does not call the result a group chat.

## Decision

### 1. A place invite is `user.invite` with no `channelId`, offered from the home profile menu

The home header's profile dropdown gains "Invite to place" under "Place settings". It opens
`/invite/place/:placeId`, a name-and-number form that sends `user.invite { name, phone }` — the key
absent, not `undefined` — and hands the returned link to the SMS composer, or the clipboard on the
web, exactly as the room invite's single-recipient path does. The SMS copy names the place, because
"invited you to a chat" would promise a room the recipient does not get.

The dropdown was chosen because it already acts on the active place and nothing else: its one
existing entry is keyed by the session's site. A per-row action on the place list would offer to
invite into a place the session is not on.

### 2. The session names the place, so the form checks the session, not only the route

With no site on the wire, the server files the invite under whichever site the session is sitting
on. One rule, `resolvePlaceInviteGate`, decides for both the menu entry and the form:

- **hidden** on the relay (its single place has no owner), for a guest, and for anyone whose place
  row does not say `isOwner: true` — including a row not loaded yet. The server's `isOwner` is the
  only authority on ownership.
- **disabled** while a place switch is in flight, or when the place shown and the session's place
  disagree.
- **ready** otherwise.

The form re-reads the gate when the user submits, not only when it renders. Between opening the form
and sending it, another tab or a push can move the session, and sending then would invite the person
into a place the screen never named. A direct visit that resolves to `hidden` goes home.

### 3. An invite with no room is captioned as a place, not a group chat

The accept screen's target card gained a third kind, `place` ("Place member"). `CloudInviteAccept`
picks it when the invite metadata has an empty `channelId`, and keeps the group default until the
metadata arrives. The room member count is not shown for it — the count is a room's roster. Nothing
after the accept button changed: the pipeline already skipped the room step when there was none.

### 4. One recipient at a time

The form issues one invite per submission. There is no batch path, even though
`user.invite-batch` also accepts a missing `channelId`. See the second cost below for why a smaller
surface is the safer one while that cost stands.

## Consequences

**What it costs**

- **The owner cannot see who they invited.** There is still no place member list (ADR-0075), and
  every member picker is built from the rosters of rooms the owner shares with people. A place-only
  invitee is in no room, so they appear in no picker — the owner cannot add them to a room until
  they are in one. This is the largest gap the feature leaves, and it is left knowingly: closing it
  needs a place member listing from the backend.
- **An invite that is never accepted still leaves a member.** The role row is written when the invite
  is issued. The cloud invite lane has no list and no cancel, so the app has no way to take that row
  back. This is why decision 4 keeps the surface to one invite at a time.
- **There is still no way to leave a place.** The invitee's empty state already says they can leave,
  and the place settings hub has no such action (ADR-0095 deferred it). A place-only membership
  makes that gap easier to hit.
- **Design not yet confirmed.** The menu entry, the form's copy and the "Place member" caption follow
  the existing contact-invite and accept-screen patterns. None was drawn for this flow.

**What it does not change**

- The room invite (`/channels/:channelId/invite`) and the relay 1:1 invite are untouched.
- The accept pipeline — login with the code, then enter cloud, site and room — is untouched.
