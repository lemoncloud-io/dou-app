# ADR-0140: Desktop lists a cloud 1:1 in the places its peer shares with me

> Status: Accepted · Decided: 2026-09-29
> · Scope: `apps/desktop-web/src/app/shared/utils/cloudDmPlaces.ts` · `apps/desktop-web/src/app/shared/hooks/useChannels.ts`
> · `apps/desktop-web/src/app/shared/hooks/usePlaceUnreadCounts.ts` · `apps/desktop-web/src/app/shared/stores/useKnownChannelsStore.ts`
> · `apps/desktop-web/src/app/features/chat/**` (opening a 1:1 from a notification, a saved item or the quick switcher)
> · Supersedes, for desktop's list only: [ADR-0113](./0113-a-cloud-1-1-has-no-invite-and-no-place.md) decision 1's
> consequence that a cloud 1:1 is listed in every place of its cloud
> · The module doc is [direct-messages.md](../../apps/desktop-web/docs/chat/direct-messages.md)

## Context

ADR-0113 settled that a 1:1 inside a subscription cloud belongs to the cloud. Its `sid` names only
the place its creator happened to be standing in, so `sid` could not decide where the room is
listed. Desktop took the simplest reading of that: list every cloud 1:1 in every place.

That reading does not survive how people get into a cloud. They are invited **per place**, so the
person on the other end of a 1:1 may be in some of my places and absent from the rest. With the
every-place rule, a place that person was never invited to still lists a conversation with them.
On a test cloud, six 1:1s showed up identically in all six places, and in four of those places
none of the six people were there.

## Decision

### 1. A cloud 1:1 is listed where its peer shares a group channel with me

The places that list a 1:1 are those in which the other participant is a member of at least one
of my group channels. A peer who is in two of my places gets the room in both.

**Membership is read from my group channels, because nothing else carries it.** The socket
contract has no place member list. The place profile cache looked like one, but a member has a
row there only after setting a place profile; on the test cloud it held zero rows across all six
places. Group channel rows do carry `memberIds`, and they arrive with the same cloud-wide read the
sidebar already makes.

### 2. A peer found nowhere is still reachable

When the peer shares none of my places, the room is listed in its stamped place (`sid`) if that
place is mine, and in every place otherwise. A room I cannot navigate to is worse than one listed
too widely. A room whose members are not known yet (one `startDm` has just returned) takes the
same path.

### 3. Every surface that places a 1:1 uses the same rule

The rule is one function, `cloudDmPlaces`, and the list, the place rail's unread dots, the quick
switcher's index and the landing of a notification or saved-item open all call it:

- **Opening** stays in the current place when it lists the room, and otherwise switches to a place
  that does, the stamped place first. Opening in the stamped place unconditionally would wait on a
  place that may not list the room, until the pending landing expires.
- **Unread** puts a dot on every place that lists the room, and the window title and OS badge count
  the room once.
- **The quick switcher** offers a 1:1 listed only in other places as an "in another place" row.
- **The New message picker** follows automatically: its pool is read from the open place's list, so
  a 1:1 started from it is always listed in the place it was started in.

### 4. The rest of the place is listed too

Filing 1:1s by place left a place's Direct messages section empty wherever none of its people had a
1:1 with me, which read as a place with nobody in it. So after the 1:1s the section lists the place's
other members, by the same group-channel membership, and clicking one starts the 1:1. They have no
room yet, so they cannot be reordered or starred, and a person whose name has not loaded is not drawn.

### 5. Desktop only

Mobile keeps ADR-0113's single cloud-scoped section for 1:1s, which never showed the same room
under several places, so the problem this record fixes does not arise there.

## Alternatives

**List by `sid`.** Rejected for the reason ADR-0113 gives: the stamp is true for the creator only.

**Read membership from the place profile cache.** Rejected on measurement, as decision 1 says. It
would also misjudge a place's owner, since creating a place writes no profile row for them
(ADR-0094).

**Wait for a server field** — a place member list, or the shared places on the 1:1 row. That would
be exact, but it blocks a visible defect on work nobody has scheduled. It is the follow-up below.

**Hide a 1:1 whose peer shares no place with me.** Rejected: nothing would lead back to the room,
and a notification for it would land on a list that lacks it.

## Consequences

**What is gained**

- A place's Direct messages section shows the people who are in that place: their 1:1s first, then
  everyone else in it.
- The list, the unread dots, the quick switcher and notification landing agree about where a 1:1
  lives.

**What is accepted**

- **A place member who shares none of my channels is not seen.** A 1:1 with them is listed by the
  fallback rather than in the place they share with me.
- **A 1:1 can appear in more than one place.** That is correct when the peer is in both.
- **A room can move.** When the peer leaves the last channel we share in a place, the 1:1 drops out
  of that place's list, like any channel that leaves a list.
- The unread dots read a separate server listing from the sidebar's cache, so for a moment a dot can
  sit on a place whose list has not caught up.

**Follow-ups**

- A server request: a place member list, or the places a 1:1's participants share, returned on the
  1:1 row. Either replaces the group-channel reading in `cloudDmPlaces` without changing any
  surface that calls it.
