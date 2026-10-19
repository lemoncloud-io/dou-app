# ADR-0210: A cloud 1:1 belongs to the place it was opened in

> Status: Accepted · Decided: 2026-10-19 · Implemented: `feat/place-scoped-dm`
> · Scope: `libs/data/src/domain/channelScope.ts` and the 1:1 place chain in `libs/data` ·
> `apps/desktop-web/src/app/shared/**` · `apps/desktop-web/src/app/features/chat/**` ·
> `apps/web/src/app/hooks/**` · `apps/web/src/app/features/home/**` ·
> `apps/web/src/app/features/channels/lib/channelStereoPolicy.ts` · `apps/web/src/app/bridge/navigation/**`
> · Supersedes [ADR-0113](./0113-a-cloud-1-1-has-no-invite-and-no-place.md) decision 1 ·
> [ADR-0141](./0141-desktop-lists-a-cloud-1-1-in-the-places-its-peer-shares.md) ·
> [ADR-0153](./0153-mobile-neither-opens-nor-lists-a-cloud-1-1.md) decisions 2 and 3 · the 1:1 rule of
> [ADR-0198](./0198-the-threads-list-is-the-active-places-and-a-1-1s-threads-are-the-clouds.md)
> · Keeps [ADR-0127](./0127-desktop-names-a-1-1-peer-by-place-profile-else-cloud-profile.md) (its
> reasoning now reads the room's place) and ADR-0153 decision 1 (mobile makes no cloud 1:1)
> · The module docs are [direct-messages.md](../../apps/desktop-web/docs/chat/direct-messages.md) and
> [dm-and-self-chat.md](../../apps/web/docs/feature/channels/dm-and-self-chat.md)

## Context

ADR-0113 settled that a 1:1 inside a subscription cloud belongs to the cloud, because the server
resolved a pair of people to one room whatever place it was opened from. The place that room carried
was only where its creator had been standing, so the app stopped reading it as a scope key: desktop
filed each cloud 1:1 under the places its peer shares with me (ADR-0141), mobile listed none
(ADR-0153), and a 1:1's threads were listed in every place (ADR-0198).

The server no longer works that way. The socials server now opens a separate 1:1 per place: a new
room's id is `<sid>@<uidA>@<uidB>` (the two uids sorted), and its place is the one the requesting
session was on when it asked. It never changes. A room opened before that keeps its pair-key id
(`<uidA>@<uidB>`) and carries on in the place it was stamped with. The `channel.start-dm` call is
unchanged, a room the app opens gets no automatic alias (`join.nick`), and a 1:1 push names the place
its sender wrote from rather than the room's. The relay's 1:1s are unchanged.

So the premise of ADR-0113 decision 1 is gone: a cloud 1:1's `sid` is now where the conversation
lives. Two people who share several places have one 1:1 in each.

## Decision

### 1. A 1:1's scope key is its `sid`, like a group room's

`isInPlaceList(channel, sid)` is `channel.sid === sid` for every room. `isCloudWideChannel` is gone.
A caller that needs a 1:1's lineage reads `cid`: `dmLineageOf` (mobile) for relay-or-cloud, which
reads an unknown cloud as a subscription one, and `isCloudDm` (`libs/data`) for the place rule, which
requires a cloud to be named, so a row with no `cid` keeps the ordinary chain. Neither decides where a
room is listed. The notes-to-self room is the one exception, as
before: it belongs to the account and every place lists it.

### 2. A 1:1's place is the server's, never the reader's

A cloud 1:1's `sid` is, in order: the place a place-keyed id names, then the server's field (`sid`,
then `$.sid`; the server's `#` reads as "no place"), then empty (`dmPlaceOf`). The id comes first
because the place it names is the one the server filed the room under and never changes, so the two
agree whenever both are present, and the id cannot be overwritten by a field some other path filled
in. The ambient place — the session's current one — is never used, in the mapper, the cache write, or
the `start-dm` answer. During a place switch the session context already names the next place while
the server files the room under the one the session is still on, and with a 1:1 listed in one place
only, that mismatch reads as "the room is in the wrong place". The id counts only when it has exactly
three non-empty `@` parts, because `@account` and a pair key hold `@` too. Group rooms keep their
existing chain, ambient step included.

A cloud 1:1 that names no place is kept by the channel sync and stored with an empty `sid` rather
than refused: refusing it would fail the whole sync it arrived in, and a cloud with no place lists it.

### 3. Desktop lists a cloud 1:1 in its own place only

The sidebar, the unread dots, the quick switcher's index and the "people of this place" list all read
the room's `sid`. The peer-shared-places rule of ADR-0141 and its fallbacks are removed. A cloud with
no place at all lists the cloud 1:1s that no place of it holds. The window title and the OS badge
still count each room once.

Opening a 1:1 from anywhere — a notification, a saved item, the quick switcher, a pending open —
lands on its own place: the cached row's, else the place its id names, and only then the place the
request named.

### 4. Desktop waits for a place switch before it opens a 1:1

`useStartDm` holds a call made while a place switch is running until it settles (read from the
switch mutation's count, so a caller that unmounts still sends). If the cloud or the place moved in
the meantime it sends nothing. When the answer's place differs from the one asked from, it logs a
warning and lands on the room's place rather than leaving it unlisted in this one. The callers do not
lock their buttons; the wait lives in that one hook.

### 5. Mobile lists a cloud 1:1 with the place's group rooms, and still makes none

Home's place section is retitled `대화방` (from `채팅방`) and holds the place's group rooms and its
1:1s together, under the same sort and pin rules. There is no separate 1:1 section; the self-chat
section and its stored fold id `cloudDm` are unchanged. A cloud 1:1 counts in its place's dot, the
bottom nav, the other-cloud count and the app icon like any room; one that names no place counts on
its own row only, because no place lists it.

**Making a cloud 1:1 is a desktop feature** (product decision, 2026-10-19). Mobile shows the 1:1s
desktop made, opens them and talks in them; it has no peer picker and no "start a 1:1" action on a
profile. This is the reason ADR-0153 decision 1 was waiting for.

### 6. A push lands on the room's place

On both platforms a 1:1 push opens in the room's place — the cached row's, else the place its id
names, else the push's `sid`. On mobile the correction is in the web's push navigation, not the
native shell: the shell passes the push's place on untouched, and a shell change would need a store
release.

### 7. A 1:1's people are named by the room's place's profiles; the chains do not change

Mobile's `profilePlaceOf` returns the room's `sid`, falling back to the reader's place only for a room
that names none (`''` or the server's `#`). The 1:1 title chains are unchanged on both platforms:
mobile does not gain a cloud-profile fallback, and desktop keeps ADR-0127's order. On desktop a 1:1
opens only in its own place, so "the current place's profile" already is the room's.

### 8. A 1:1's threads are listed in its own place

The desktop threads pane lists a cloud 1:1's threads in the room's place only, like a group room's.
The notes-to-self room's threads, and the relay's 1:1s', stay in every place.

## Alternatives

- **Keep treating a cloud 1:1 as cloud-wide.** Every place would list every 1:1 with that person —
  now several distinct rooms, one per place — and the reader could not tell which conversation is
  which.
- **Keep desktop's peer-shared-places filing.** It would file each of the per-place rooms under every
  place the peer shares, so the same duplicates appear, only fewer of them.
- **Fill a 1:1's missing `sid` from the session's place**, as group rooms do. Right almost always, and
  wrong exactly during a place switch — the one moment it matters, because the server has already
  filed the room under the place being left.
- **Give mobile its own 1:1 section**, apart from the group rooms. A second list for what is now an
  ordinary room of the place; the product chose one list.
- **Add a cloud-profile fallback to mobile's 1:1 title chain.** It would name more peers on new rooms,
  which the server no longer aliases. Not chosen: the name chain stays as it is on each platform.

## Consequences

- **Two people with several places in common have several 1:1s**, one per place, each with its own
  history. A 1:1 opened from a second place does not bring the first one's messages.
- **On mobile, a peer with no profile in the room's place reads as the room name or the default 1:1
  label.** New rooms get no alias from the server, so this shows up more often than before. Desktop
  falls back to the cloud profile (ADR-0127).
- **The app and the server have to ship together.** With only the server out, an older app shows
  two 1:1s with the same person. With only the app out, the server still answers with the pair-key
  room, so a 1:1 opened from a second place returns to the room stamped with the first, and the app
  moves to that place to land on it. Desktop builds that have not auto-updated keep showing
  duplicates after the server ships; the data is right.
- **A room from before places keyed 1:1s that names no place** appears only where a cloud has no
  place on desktop, and nowhere on mobile home; search and push still reach it.
- **An old room stamped with a place I am not in** drops out of every list; search and push still
  reach it.
- **Leaving a place leaves its 1:1s behind** on the server; that belongs to the place-leave work, not
  here.
- **The quick switcher's persisted index can still hold one older 1:1 filed under several places**
  until those filings age out. It is offered once, and opening it goes to its own place.
- The quick switcher's row for a 1:1 in another place is still named by the cloud profile, not that
  place's — reading the other place's profiles would need a subscription to them.
- A cloud 1:1 still skips its stored `join.nick` (ADR-0113 decision 10): the server no longer writes
  one for new rooms, but old rooms keep the value it wrote.
