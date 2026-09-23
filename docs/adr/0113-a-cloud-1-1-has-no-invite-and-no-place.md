# ADR-0113: A 1:1 opened inside a cloud — no invite, no place, and a second axis under `stereo`

> Status: Accepted · Decided: 2026-09-22 · Implemented: `feat/cloud-dm` (partly — § Consequences lists what is not built yet)
> · Scope: `apps/web/src/app/features/channels/**` · `apps/web/src/app/features/invite/accept/**` ·
> `libs/data/**` · `libs/logger/**` · the sockets library and its types
> · Builds on [ADR-0032](./0032-dm-chat-room-screen.md) (the 1:1 screen) ·
> [ADR-0039](./0039-dm-display-name-chain-and-invite-profile-release.md) (the name chain) ·
> [ADR-0068](./0068-dm-peer-departure-and-reinvite.md) (departure and re-invite) ·
> [ADR-0109](./0109-one-rule-for-a-move-into-history-i-can-no-longer-see.md) (what "the peer is gone" is read from)
> · The module doc is [dm-and-self-chat.md](../../apps/web/docs/feature/channels/dm-and-self-chat.md)
> · Merged as ADR-0111, a number the picked-image decision had already taken; the `(ADR-0111)` in
> the `feat/cloud-dm` commit and in `CHANGELOG.md` means this record

## Context

A 1:1 could only be reached one way: invite a phone number. That single path decided more than it
looked like it did.

An invite carries no notion of a place, so a room born from one had nowhere to be put except the
relay's default place — and the relay has exactly one place, so "which place's name is this?" never
came up. The question was not answered; it was unaskable.

Three requests arrived together and they are one piece of work. Open a 1:1 inside a subscription
cloud. Let the same person appear differently in different places. Show the inviter's place profile
on an invitation rather than their account name. The first makes the other two answerable, because
it is the first time a 1:1 exists in a context with more than one place in it.

The unblocking change came from the server: an action that opens (or returns) the 1:1 with a peer
from their user id alone. Measured against the published contract rather than a dev call: it takes
`{ peerId }`, returns a channel view, and that view carries **no site and no cloud**. The client's
cached channel requires both.

## Decision

### 1. A cloud 1:1 belongs to the cloud, and `sid` does not scope it

The action neither takes a place nor returns one. The two participants need not share a place, so no
single place could be correct for both of them; a room that picked one would be wearing a label that
is dead on the other person's screen.

> **Corrected by measurement (2026-09-23).** The conclusion drawn from that — "so the room has no
> place, and the client stores it with `sid` blank" — was wrong about the server. **The server does
> assign the room a place**: whichever one the creator was standing in when they opened it, returned
> on every read thereafter. A client that blanks the field has it filled back in by the next sync,
> and the room then appears under a place the other participant may not be in.
>
> Measured with the room open from two different places: the id is derived from the pair, so the
> second call returned **the same room**, still tagged with the first place. There is no second room
> to make per place, and no point at which that tag becomes right for both people.

**So the client stops writing the field and stops reading it as scope.** The value is left exactly as
the server sent it — nothing is blanked, and nothing fights the server over something it owns. What
changes is what the field is allowed to decide:

- **A group is read within its place.** Its `sid` is where it lives, and a place-scoped read finds it.
- **A 1:1 is read across the cloud.** Its `sid` describes where one person happened to be standing,
  which is no basis for deciding what either of them can see.

`isInPlaceList` is that rule, and it does both halves: a room read cloud-wide is in no place's list,
however its `sid` reads. Without the second half a cloud 1:1 shows twice — once under its creator's
place, once in the section built to hold it.

**Why the original approach could not have worked, beyond the server overwriting it.** A blank `sid`
meant two different things — "this room has no place" and "we do not know the place yet" — and the
write paths are built to resolve the second by guessing. A marker that the machinery around it is
designed to erase is not a marker.

### 2. No invite is involved, and none is invented

The room is opened by naming a member. Nothing is sent, nothing is accepted, and there is no phone
number anywhere in the flow. The relay's number-based 1:1 keeps working exactly as it did; this is a
second way in, not a replacement.

### 3. `stereo` is not enough — a lineage axis sits under `dm`

Both kinds of 1:1 are `stereo === 'dm'`, and the room screen decided everything from that one value.
Left alone, a cloud 1:1 would light up the re-invite footer built by ADR-0068: a CTA offering to
re-send an invite that never existed, in a room with no number to send it to.

`dmLineageOf` answers `'relay'` or `'cloud'` from `cid` — the cloud the room is in. `hasDmInviteFlow`
is the question call sites actually ask, and **only invite-attached behaviour reads it** — the
departure footer, its CTA, and the `invite.list` poll that feeds them. Read receipts, keeping a
departed member on the settings list, and the join/leave system messages are about a 1:1 as such and
are left alone for both lineages.

> **`cid`, not `sid` (2026-09-23).** The axis was first read off the blank place field, and decision
> 1's correction is why that failed: the field is the server's, it gets refilled, and a room silently
> changed lineage the moment a sync landed — taking the footer suppression and the naming rule with
> it. `cid` is the server's own answer to "which cloud is this room in", it arrives on every read,
> and nothing on the client derives or overwrites it. An unknown cloud reads as a subscription one,
> which is the safe direction: the relay is a single known id, so only a genuine relay room can be
> mistaken for a cloud one, and never the other way around.

What a cloud 1:1 should say once its peer leaves the cloud is an open product question. Until it is
answered the room says nothing, rather than borrowing a sentence written for a flow it does not have.

### 4. The room is cloud-scoped; the profile that names its peer is place-scoped

These are different axes and conflating them is the trap. A profile is per-place by design — the same
person has a different nick and photo in each one — so naming anybody requires choosing a place. A
cloud 1:1 has none of its own.

**The reader's current place is what names the peer.** `profilePlaceOf` returns the active place for
a cloud 1:1 and `channel.sid` for everything else, and every screen that draws a name inside a room
reads it.

Two consequences follow and both are intended. The same room names its peer differently when opened
from another place. And two participants who share no place see each other by different names —
which is precisely why the room could not have chosen one place for both.

### 5. No cloud-level profile is introduced

The obvious repair for decision 4's consequences would be a profile that is not tied to a place. It
is rejected: it adds a new stored thing, a new sync, and a redesign of the name chain, to serve the
places where a place-independent name is wanted. Those places already have one — the name I gave the
room myself, which is the first rung of the existing chain and is mine alone.

### 6. Name resolution is one call, not a copy per surface

Two surfaces drew people's names by rewriting the chain by hand instead of calling it, and both could
put a raw account id on screen — one ended its fallback chain at the user id, the other re-read a
cached name without checking whether that name _was_ the id. Those were repaired into the shared
resolver as part of this work, before anything new was hung off it.

This matters more here than it did before. A cloud 1:1's peer is named through the chain on three
surfaces at once, and a fourth that re-derives it would not be visibly wrong until two places
disagreed about the same person.

### 7. The candidate list is "people I share a room with", not "everyone in the cloud"

There is no user directory to ask; every listing action is channel-scoped. So the picker's candidates
are the union of the members of the rooms I am in, widened from one place to the whole cloud. This is
a real limit on the feature, not an implementation shortcut, and the screen has to read as that
rather than promising a directory it cannot produce.

## Alternatives

**Reach a cloud 1:1 through the existing invite.** No new server action, and one code path instead of
two. Rejected because an invite is bound to a phone number — which is the security model of the
relay's 1:1, not an incidental detail — and requiring a colleague's phone number to message someone
already in the same cloud is the friction the request was about.

**Give the room a place: the opener's current one.** The room would drop into an existing list with
no new section, and `profilePlaceOf` would not be needed. Rejected because the label is only true for
one of the two participants. The other would see a room filed under a place they may not be in, and
the pair would disagree about where their conversation lives.

**Decide the lineage from the absence of an invite rather than from the place.** Reads more directly
as "has no invite". Rejected because it makes a UI decision wait on a network answer that is polled,
so the footer would appear and then withdraw; the place field is already on the row being rendered.

**Add a cloud-level profile** (decision 5's counterpart). Copy and data would agree and one name would
follow a person everywhere. Rejected for cost, and because the first rung of the name chain already
covers the case.

**Keep `stereo === 'dm'` as the only axis and special-case the footer where it renders.** The smallest
change. Rejected as the same shape ADR-0068's own policy module was written to end: a condition
omitted at one call site compiles, and the next surface to ask "is this a DM?" gets no rule at all.

## Consequences

**What is gained**

- A 1:1 inside a cloud needs no phone number, which was the request.
- A cloud 1:1 cannot show the relay's re-invite flow, and a unit test holds that shut.
- The same person can be named per place, which is what a per-place profile always meant.
- One name resolver, with the two hand-written copies retired — including the two paths that could
  print a raw account id.

**What is accepted**

- **Cloud 1:1 rooms appear in no place's list** and depend on the cloud-scoped section, which is why
  that section is part of this change rather than a follow-up: without it a room opens, the reader
  navigates away, and it is gone.
- **The same room names its peer differently from different places** (decision 4). Intended, and it
  will read as a bug to anyone who has not been told.
- **A peer with no profile in the reader's current place falls to a lower rung of the name chain.**
  This is the normal case for two people who share a cloud but no place.
- **What a cloud 1:1 shows when its peer leaves is unanswered**, and the room is silent about it.
- **The candidate list cannot be the whole cloud** (decision 7).
- **The invitation's name is not fixed by this ADR.** The accept screens still read the inviter's
  account name; see below.
- **Three screens ship without a comp** (decision 8). They will look different once one exists, and
  anybody reading them before then should not take the arrangement as decided.

### 8. The screens are built from the design system, and say so

No comp exists for any of the three new surfaces — the peer picker, the 1:1 row on a participant's
profile, and the cloud-scoped section with its empty state. Waiting was the alternative, and it
leaves decisions 1 through 7 unreachable: a room nobody can open is not a feature, and none of the
rules above can be exercised, let alone reviewed, without a way in.

So they are assembled from `web-ui-kit` primitives, reusing the nearest precedent's composition
rather than inventing one. **What is settled by this ADR is behaviour, not appearance**, and the
provisional pieces are marked as such where they are written. A comp replaces the arrangement; the
rules stay.

Two of them reuse more than primitives. The cloud section **is** `ChannelList` with a different
title and source, because every row rule — the title chain, the avatar, unread, the last-message
preview — is decided there, and a second row component would be a second place for those to drift.
The picker follows `PlaceInviteTab` but picks one person instead of many, so a row is the action and
there is no confirm step.

### 9. One menu entry, two destinations

"1:1 대화" sits in the home create menu and meant one thing: go to the phone-number form. That entry
was shown by `isDefaultCloud`, which was deciding **whether the entry appears** and standing in for
**what it does** at the same time.

Those are split. The list draws the entry when asked (`showOneOnOneCreate`); the page picks the
destination by cloud — the contact form on relay, the picker inside a cloud. Relay's flow is
untouched, which is the non-goal this split protects, and the group-create upsell rule is pinned by
its own test in both directions.

**Three environments, not two.** An invited cloud is the third, and it was excluded by accident:
`canCreate` opened the whole popover and means "may make a room here", which an invited member may
not. But a member who cannot make a room can still talk to the people already beside them — they
share the rooms that make those people reachable at all, which is this feature's whole premise. So
the popover now opens for either entry, and `canCreate` guards only the group row.

That guard is load-bearing rather than tidy. `showGroupCreate` is written as a negative
(`!isDefaultCloud || !isPro`), which reads **true** for every cloud that is not the relay — so
opening the popover for an invited member without it would have offered them precisely the one
action they are refused.

### 10. A cloud 1:1 does not read `join.nick`, until the server can say who wrote it

The 1:1 title chain opens with `join.nick` — "the name I chose for this room" — and that
precedence is right: my own name for a room should beat the name its occupant chose for themselves.

**The premise is what fails.** The server seeds that field on rooms nobody has named. The existing
guard rejects seeded values that LOOK machine-made — a raw id, `User_0101`, a masked number — and it
cannot do better, because nothing in a string says who wrote it. Measured on dev: a cloud 1:1 opened
from the picker came back with a plausible human name in `join.nick`, so the room header showed that
while the picker, the entry system message and every other surface showed the place profile. One
person, two names, and the one on the header was chosen by nobody.

That is not a cosmetic mismatch here. Decision 4 makes the place profile the answer to "who is
this", and a value the client cannot authenticate was overriding it.

**So the cloud lineage drops that rung**, and only that lineage. A relay 1:1 begins at an invite form
where the sender types the friend's name, which lands in their own `join.nick` — a real choice that
has to survive, and the non-goal this decision must not disturb. A cloud 1:1 has no step where a name
is typed, so nothing is lost by ignoring the field.

**The room-settings name row follows.** It edits `join.nick`, and an editor that saves a value no
screen will show is worse than no editor, so for a cloud 1:1 the row stays as the title and stops
being a button.

**This is a stopgap over a server behaviour, and it is worth naming as one.** The client is guessing
at provenance from a string, and that is the thing that failed. The fix belongs on the server: stop
seeding `join.nick`, or mark whether a value was set by a user. When either lands, the rung comes
back and the settings row opens with it.

**Follow-ups**

- Comps for the three new surfaces. The behaviour is fixed and tested; only the arrangement is
  waiting, so a comp lands as a presentation change rather than a rebuild.
- **A server request: stop seeding `join.nick`, or say whether a value was user-set** (decision 10).
  Until then the client cannot tell a name a person typed from one the server wrote, and the cloud
  lineage ignores the field rather than trust it.
- Whether the picker should say anything about people it cannot offer — decision 7's limit is
  visible as an absence, and an absence explains nothing.
- Invitations naming the inviter by their place profile. The invite response carries account identity
  only, so the app would look the profile up itself — and the reader of an accept screen is not yet a
  member of that place. Whether a non-member may read it is unmeasured, and the work is paused until
  it is. If it cannot, the field has to be denormalized into the invite response server-side.
