# ADR-0216: Mobile gives a cloud 1:1 its own section, and starts one

> Status: Accepted · Decided: 2026-10-20 · Implemented: `feat/cloud-home-dm-sections`
> · Scope: `apps/web/src/app/features/home/**` · `apps/web/src/app/features/channels/**` ·
> `apps/web/src/app/stores/preferenceKeys.ts`
> · Supersedes [ADR-0153](./0153-mobile-neither-opens-nor-lists-a-cloud-1-1.md) decisions 1 (mobile
> makes no cloud 1:1) and 4 (the self chat's own section) ·
> [ADR-0210](./0210-a-cloud-1-1-belongs-to-the-place-it-was-opened-in.md) decision 5 (one list for a
> place's rooms on mobile, and no cloud 1:1 made there) ·
> [ADR-0113](./0113-a-cloud-1-1-has-no-invite-and-no-place.md) decision 7, for mobile (candidates are the
> place's members, not the people I share a room with)
> · Keeps ADR-0210's other decisions — a cloud 1:1 belongs to the place it was opened in, and a call
> that makes one waits for a running switch
> · The module docs are [dm-and-self-chat.md](../../apps/web/docs/feature/channels/dm-and-self-chat.md)
> and [home/README.md](../../apps/web/docs/feature/home/README.md)

## Context

ADR-0153 took the cloud 1:1 off mobile: no picker, no "start a 1:1" row on a profile, and no list.
ADR-0210 brought the list back once the server began opening one 1:1 per place, and put those rooms
in the place's one room list, `대화방`, beside the group rooms. Making a cloud 1:1 stayed a desktop
feature.

The product owner has reversed both halves for mobile (2026-10-20). A cloud's home should show its
1:1s and its group rooms as separate sections, and a mobile member should be able to start a 1:1
without going to desktop. What ADR-0210 established about the room itself is unchanged: a 1:1 is filed
under the place the session is on when the server answers, and never moves.

## Decision

### 1. A cloud's home splits the place's rooms into `1:1 대화` and `그룹 대화`

The split reads the room's kind (`channelKindOf(stereo)`) and nothing else, the rule every other 1:1
decision reads, so a group with two members stays a group. Both sections are the same `ChannelList`
under the place's sort and pins. The relay keeps its one list under the default `대화방` heading: its 1:1s are reached by phone
number, and its only other room is the self chat, so a split there would move one row.

### 2. The cloud's self chat leads the 1:1 section

It used to have a section of its own. It is a conversation with one person — me — and desktop lists
it at the top of its direct messages, so it goes atop the 1:1 section (`leadsWithSelf`), whichever
place is open. The section keeps the stored fold id `cloudDm`, which first named a 1:1 section, so no
user's fold resets. With no place open the section shows only while a self room exists, and offers no
way to start a 1:1, since there is no place to file one under.

### 3. Mobile starts a cloud 1:1 from the section and from a profile

- **The section's ＋** opens a member picker. It is the section's only action, so the ＋ runs it
  directly rather than opening a one-row popover. Any member of the place gets it, owner or invited:
  a 1:1 is between two people, not a room the place's owner hands out.
- **A member's profile** offers `1:1 대화하기` — in a cloud group room, in the place the session is
  on, for anyone but me (`canStartDmFromProfile`).

### 4. The candidates are the members of the session's place

The picker reads `place.list-user` for the place the session is on, minus me — the list the place's
member screen shows and the one desktop's picker reads. A room from outside that list would be a 1:1
filed in this place with someone who is not in it. When the list cannot be had the picker shows an
error and a retry, never a stand-in from my rooms' rosters — unlike desktop's picker, which falls back
to them.

### 5. Every entry point goes through one switch-aware hook

`useStartDm` waits for any running place or cloud switch to settle before `channel.start-dm` goes out,
and sends nothing if the session ended somewhere other than where the person asked from — ADR-0210's
rule for any client that makes a 1:1, held in one hook so no entry point has to lock its button.

## Alternatives

- **Keep ADR-0210's one list and only add the create entry.** Smaller, and the product would still
  have asked for the split; the request was for both.
- **Keep the self chat in a section of its own**, giving three room sections. It keeps a heading over
  what is usually one row, and mobile would disagree with desktop, which lists it among its direct
  messages. The product owner chose to fold it in.
- **Offer the 1:1 entry inside the existing ＋ popover**, as on the relay. On a cloud the 1:1 section
  has nothing else to put in it, so the popover would hold one row.
- **Candidates from the union of my rooms' rosters.** No extra server call, but a member who shares no
  room with me could never be reached, and a roster spans places while the 1:1 is filed in one.
- **Restore mobile's earlier picker and hook unchanged.** The earlier hook did not wait for a place
  switch, and its candidates were cloud-wide; both are wrong since ADR-0210.

## Consequences

- **Mobile and desktop now both make cloud 1:1s**, so a regression in the shared server rule shows up
  on both.
- **The picker can list someone a 1:1 cannot reach yet.** `place.list-user` includes invitees who have
  not accepted; starting a 1:1 with one is expected to fail, and the app says so when it does. Nothing
  on the list marks them.
- **A switch that moves the session away mid-call drops the request silently.** That is deliberate —
  the place the person asked from is gone — but it reads as a tap that did nothing.
- **The picker has no design yet.** It is built from web-ui-kit primitives and will change when a comp
  arrives; its behaviour is what this record fixes.
- **The `channels` fold id now names a cloud's group section and the relay's list**, and `cloudDm` a
  cloud's 1:1 section; a user who had folded the self chat section finds the 1:1 section folded.
