# ADR-0068: Peer departure and reinvite in a 1:1 room — a derived status footer, rejoining the same room, a 24-hour link

> Status: Accepted · Decided: 2026-08-25
> · Follows [ADR-0032](0032-dm-chat-room-screen.md) (DM screen) · [ADR-0039](0039-dm-display-name-chain-and-invite-profile-release.md) (name chain)
> · [ADR-0067](0067-rejoin-hides-prior-messages.md) (rejoin display gate) lays the groundwork this scenario assumes
> · The relay invite send flow is [relay-invite-sender.md](../../apps/web/docs/feature/invite/relay-invite-sender.md),
> accept is [relay-invite-accept.md](../../apps/web/docs/feature/invite/relay-invite-accept.md)

## Context

What ADR-0032/0039 built is "the screen that opens an existing DM room." What came **after** that was empty — when a
peer leaves the room, the screen says nothing, you can keep writing into an empty room, and there's no way to call
them back.

16 Figma nodes draw a full loop across that gap ([4041-33606](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=4041-33606)
and others).

| Segment                                                | Node                                              | Current state                                                                    |
| ------------------------------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| Empty room + entry intro                               | 4041-33854 · 4068-15612                           | Implemented (`RoomIntro` dm variant)                                             |
| Peer departure — notice + CTA + input lock             | 4041-33606 · 4068-15233                           | **None**                                                                         |
| Reinvite form / confirmation / change contact          | 4068-15512 · 4068-15399 · 4059-13443 · 4142-24843 | The form exists in `ContactInvitePage`, but there's no entry point from the room |
| In-room invite state + expiry countdown                | 4062-14154 · 4062-14493 · 4064-14672              | **None**                                                                         |
| Rejoin complete — input reactivated                    | 4055-13019                                        | **None**                                                                         |
| Room settings (DM) — a "left the chat" row, leave room | 4052-12242                                        | Current code **deliberately hides** members who left                             |
| Friend info sheet                                      | 4052-12782                                        | `JoinNickDialog` occupies the same spot with a different look                    |
| Leave confirmation                                     | 4068-16586                                        | The `ConfirmDialog` leave variant is reusable                                    |
| 3 invite-link alerts                                   | 4038-11895                                        | Equivalent counterparts already exist on the accept side                         |

### Facts from the investigation that shaped the decision

1. **The server already supports "reinvite into the existing room."** `InviteCreateRequestData` has `channelId?`
   ("the channel this code admits into") and `expiresDays?` (defaults to 3 when unset). The web's
   `RelayInviteCreateInput` is `{phone, name, countryCode}` only — it **never sends channelId** — so accepting today
   always creates a new DM room.
2. **ADR-0067 already closed the data side of rejoining.** The server resets cursors on rejoin and the client hides
   pre-departure messages with the `joinedNo` display gate. That is, "the one who stayed keeps history, the one who
   returns sees an empty room" already holds.
3. **"Invite link expires in HH:mm:ss" can't be a stored message.** It's a value that ticks by the second. Meanwhile
   `chat.subType` today is only `'join' | 'leave'` (`utils/systemMessage.ts`).
4. **There's no way to learn the peer's phone number.** `MyInviteView` gives only `last4`
   (`InviteChannelRow` renders it via `contactInvite.maskedPhone` as `***5678`). A number-based user's `name` is also
   `***<last 4 digits>`. The original number lives only in `dou.relayInvite.sentLog.v2` (localStorage) — **only for
   invites I issued from this device.**
5. **"Send by link" doesn't bypass the phone number.** An invite code is bound to a phone number, and the accept
   side hits the `last4` comparison, ending in "This is not the invited number." The group's link invite
   (`AddFriendSheet`) also takes a name+phone first and only returns the link afterward — a link is a delivery
   mechanism, not a target designation.
6. **Hiding departed members from the list was the result of a bug fix.** `useChannelMembers` filters with
   `hasLeftChannel(join)`. `join.joined === 0` meant both "invited but not yet joined" and "left," which caused an
   "invite pending" badge to show on someone who had left; that was fixed by discriminating on
   `joinedNo`/`reason` (`utils/membership.ts`).
7. **The Figma copy "valid for 24 hours" contradicts an existing principle.** The relay-send doc's design principle
   is _"render only the server's expiry value — never hardcode a duration in copy (ADR-0089 D8 — 3 days)."_
8. **There are two channel-scoped invite APIs.** `user.invite` (`{channelId?, name, phone}`, used by group add-friend)
   and `invite.create` (`{phone, name, channelId?, countryCode?, expiresDays?}`, used by relay 1:1). Only the latter
   has adjustable expiry, country code, and the `invite.list`/`cancel`/`reject` state lifecycle.

## Decision

### 1. In-room invite state is drawn as a **client-derived footer**

Render one block at the bottom of the stream, derived from that room's latest invite state. No new server
`subType` is created.

- Derived inputs: `hasLeftChannel(peerJoin)` + the latest `MyInviteView` pointing at this channel (matched by
  `invite.list`'s `channelId`).
- What it holds: departure-support copy ("Invite them to talk again."), invite complete/rejected/expired copy, a
  live countdown from `expiredAt`, and a **reinvite CTA**.
- What it doesn't hold: the join/leave fact itself. That still arrives as a server system message
  (`join`/`leave`) and stays in the stream as-is.

**"Friend invited" means the invite was sent** — not accepted. Acceptance is spoken by the `join` system message
that follows it (this is why 4055-13019 shows both sentences side by side).

The countdown is a per-second tick, so this block is **current state**, not history. It disappears once the peer
comes back.

### 2. Reinviting **puts them back into the same room** via `invite.create({ channelId })`

No new room is created. As a result a single room keeps its identity as "the 1:1 with this person," and ADR-0067's
gate guarantees "whoever returns sees an empty room."

- The API is `invite.create` (not `user.invite`) — it has `expiresDays`·`countryCode`, and can use the
  `invite.list`/`cancel`/`reject` state as-is, so decision 1's footer reads all its material from one place.
- Open up `channelId` and `expiresDays` on `RelayInviteCreateInput`.
- The target is treated as **the same person.** "Change contact" is for correcting the same person's changed number
  — no path is created for adding a third party into this room.

> **Confirmed by measurement (2026-09-18)** — a DM channel id is **derived from the pair** (`{ownerId}@{peerId}`),
> so this decision was already the server's behaviour rather than something the client had to arrange. Leaving and
> re-accepting returned the same id, the room list still held exactly one DM with that peer, and the returning
> side's `joinedNo` advanced while the stayer's stayed at its original value — ADR-0067's gate reading exactly as
> designed.

### 3. "Reinvite" goes **straight to the phone-entry screen** — no confirmation step

`Reinvite` → name/phone entry form → `Done` → SMS sent → return to room.

- The name is prefilled from the last invite/departed-member name. The phone is prefilled if it's in the local log,
  otherwise blank — **either way, it's the same screen.**
- Figma's confirmation screen (4059-13443 · 4068-15399, "Reinvite ...?") is not used in this implementation. Chose
  to cut one screen from the flow.
- Not knowing the number is **a reason to ask for input, not a reason to block.** A reinvite from within a room
  always goes through the form, so the dead end of "this device has no information" doesn't exist on this path.

> **Correction during implementation (2026-08-25)** — the draft said it would **remove** the
> `reissueMissingLog` copy ("No information left on this device, can't reinvite"), but that copy isn't in the room —
> it's on [`InviteWaitingPage`](../../apps/web/src/app/features/invite/pages/InviteWaitingPage.tsx)'s "Reinvite"
> path. That screen has no form to ask for a number, so it's the only guard it has. It's not removed and stays as
> is — all this decision removes is **the dead end when reinviting from a room.**

### 4. Invite link expiry is **unified to 24 hours**, with copy derived from the server value

- Every `invite.create` call carries `expiresDays: 1`. New 1:1 invites and reinvites use the same rule.
- Screen copy is computed from the response's `expiredAt`. **"24 hours" is never a hardcoded string** — this keeps
  ADR-0089 D8's principle while matching the fact to 24 hours. If the server default ever changes, the screen
  doesn't lie.

> **Status (2026-09-18)** — 24 hours is confirmed as the policy. One screen still disagrees: the invite form's
> validity line reads "3 days", because that sentence is a **remote i18n resource**, not a string in this repo. It
> is not fixed by a code change here and is tracked separately.

### 5. Lock the composer when the peer is gone

~~When `hasLeftChannel(peerJoin)` is true, disable the composer~~ (4041-33606). It reactivates once the peer rejoins
(4055-13019). This avoids sending a message nobody will receive and leaving the read receipt permanently stuck at
`1`.

> **Correction after measurement (2026-09-18, shipped in dou-app#475)** — the departure signal named here does not
> exist. Measured on dev with two accounts: when the peer leaves, the server drops them from `channel.memberIds`
> **and stops returning their join row at all**. With no row to read and no peer id to look one up by,
> `hasLeftChannel(peerJoin)` never evaluates and the room stays `present` — the composer kept accepting messages and
> the footer never appeared. `keepLeftMembers` cannot help either: it un-filters departed members out of the join
> list, and there is no row to un-filter.
>
> The condition is now the **OR of two readings** (`useDmInviteState`): `isDmPeerMissing(channel, userId)` — the
> roster no longer holds anyone but me — or the join row saying it ended, where a row still exists. This is not a
> member-count heuristic: a 1:1 is two people by definition, so the peer is looked up **by id** exactly as
> `useDmPeer` does, and the count is never compared. An empty or absent `memberIds` means "not hydrated yet" and
> deliberately does not count, or every healthy room would lock its composer for a beat on a cold open.
> Decision 6's settings row inherits the same condition.

### 6. Show a departed member as "left the chat" in room settings (DM) — DM only

- Relax the `hasLeftChannel` filter **only for DM.** The basis stays the same join row (`joined === 0` +
  `joinedNo`/`reason`) — no new data is needed.
- Groups keep the current behavior (hidden). This avoids reviving the problem of an active group's member list
  getting cluttered with departed members.
- Fact 6 (the "invite pending" badge bug on departed members) must not recur on this row — what this row states is
  "left," not invite status.

### 7. In DM, even the owner "leaves the room" — no delete

`ChannelSettingsPage`'s `isOwner ? Delete : Leave` branch is pinned to always-leave for DM (4052-12242 has no delete
row). Rejoining needs the room to persist, and if the inviter can delete the room, there's nothing left to rejoin.
Consolidate the confirmation dialog to the single 4068-16586.

### 8. The friend info sheet is a reskin of the existing `JoinNickDialog` — UI says "friend name," data is the **channel nickname**

4052-12782 isn't new data — it's a **new design for the `join.nick` editor.** Swap in this design's copy and layout,
and add the avatar, "left the chat" status, and reinvite CTA. No new storage or state; ADR-0039's name chain (my
own `join.nick` → the peer's `profile.nick` → `channel.name` → a common label) stays as-is.

**Pinning down this mapping here matters — because what the data means and what the screen says diverge.**

| Layer  | Called           | Actually                                                                 |
| ------ | ---------------- | ------------------------------------------------------------------------ |
| Screen | Friend name      | "The friend name you set is shown only to you" — accurate wording in 1:1 |
| Data   | Channel nickname | `join.nick` = **"the name I gave this room"** (ADR-0039 context 1)       |

`join.nick` is **not** a value attached to a person. `resolveChannelTitle` uses the exact same field identically for
self, dm, and group-member cases (for a group member it's literally "the room's name"), and `resolveDmTitle`'s
fallback to `channel.name` proves it. In 1:1, the room happens to be that person, so the two meanings look the same
— but **looking the same is not being the same.**

Therefore:

- Screen copy follows Figma as "friend name."
- This value is **not reinterpreted as a per-person alias.** There is no guarantee the same name shows for the same
  peer in a different room (§Consequences).
- The component name `JoinNickDialog` stays as-is — it correctly names the data it uses, and this table is what
  closes the conceptual confusion.

### 9. The 3 invite-link alerts align with the existing accept-side dialogs

The three alerts in 4038-11895 are copy alignment with things that already exist — `dialog.alreadyJoined`
("Already joined this invite.") · `dialog.notFound`/`inviteCanceled` · an already-consumed code. No new state
determination is created; determination still comes from `getSocketErrorCode` (no parsing error strings).

### 10. Push is never assumed — correctness is measured "at the moment the screen is opened"

The footer needs three pieces of information, and they arrive by three different paths, none of which relies on
push.

| Information                     | Path                                                                                                    | Push     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- | -------- |
| Is the peer in the room         | `JoinSyncPlan` (join row `joined` 0↔1) + `join`/`leave` system messages riding `ChatSyncPlan`          | Unneeded |
| Was my invite accepted/rejected | `invite.list` refetch — **the inviter-side notification is not implemented on the backend** (request 4) | None     |
| Has the link expired            | The client determines it from `expiredAt`                                                               | Unneeded |

- Invite state reuses `useRelayInvites`'s existing machinery: `refetchOnWindowFocus` is always on,
  `refetchInterval` is `pollIntervalMs` opt-in, and `refetchIntervalInBackground` defaults to false. The room screen
  turns on polling **only while a pending invite exists**, and turns it off once the peer joins or the invite
  reaches a terminal state — the same rule `InviteWaitingPage` uses.
- **No new polling loop is created.** Only the on/off condition is newly decided by the room screen.
- The goal is not "real-time notification" but **"correct the instant the room is opened."** While looking at the
  room, the socket gives immediacy; while away, entry/focus catches it up in one shot.

### Out of scope

- **`apps/desktop-web`** — referenced but not modified.
- `apps/testbed`.
- Inviting a third party into an existing DM room (decision 2).
- Implementing the 2 confirmation screens (4059-13443 · 4068-15399) (decision 3).
- Showing departed members in group rooms (decision 6).
- New inviter-side push notifications for accept/reject — not implemented on the backend, and decision 10's
  polling absorbs it.
- Changing whether the server pushes system messages (`join`/`leave`) — the client works whether or not they
  arrive (§Consequences).
- Changing the **group** style of departure system messages — the DM footer's red copy is DM-only.

## Alternatives

**Make invite state a server system message (`invite-sent`/`invite-rejected`/`invite-expired`).** Persists as
history and both sides see the same thing. Rejected because the countdown has to be derived anyway, this would
stall the whole track on backend prerequisite work, and in a structure where the web deploys before the app, an
unsupported `subType` needs yet another fallback.

**Ask the backend for a `userId`-based reinvite API** — "bring back a member who left this room." Since the server
already holds the join row, it wouldn't need to ask for a phone number at all, avoiding PII handling. **The
cleanest answer**, but the CTA can't function until the new API ships, stalling the track. Ship the phone-based
version first and leave this path for later (§Follow-ups).

**A public invite link with no phone number.** Removes the need for the user to enter a number. Rejected because
phone binding is the security model of 1:1 itself — anyone who picks up the link would get into someone else's 1:1
room. `phone` is also a contractually required field.

**Create a new room on reinvite (keep current behavior).** The smallest client change. Rejected because the whole
Figma scenario of "leave → reinvite → rejoin, same room" wouldn't hold, and conversations with the same person would
keep piling up as new rooms in the room list.

**Correct the "friend name" copy to "room name."** Matches the data's meaning (channel nickname) exactly and never
lies even in a duplicate DM. Rejected because what a user is actually doing in 1:1 is "deciding what to call this
friend," and "room name" describes that action from further away. Chose to keep Figma's copy and document the
mapping in decision 8 instead.

**Make a per-person alias a new data field (backend request).** Copy and data would match, and the name would be
one value even across duplicate DMs. Rejected because it drags in new state, sync, and a name-chain redesign
(revising ADR-0039), plus a backend wait. What's needed right now is one screen, not a new domain.

**Keep the expiry at 3 days and only derive the copy from the server value.** No backend contract change. Rejected
because Figma states 24 hours across 3 screens, and a shorter link lifetime also reduces the exposure window of a
phone-bound invite.

**Show departed members in every room.** Consistent, and "who left" is always knowable. Rejected because it
revives the problem fact 6 fixed (a group member list polluted with departed members).

**Leave the composer open after departure.** Lets you leave a note to yourself, like self-chat. Rejected because DM
is not self-chat, and the sent message's read badge `1` would permanently claim "unread."

## Consequences

**What is gained**

- A 1:1 whose peer left is no longer a dead end — the room states what happened and offers a way to call them back,
  right there.
- **Shipping the web alone makes all of this work**, with no new backend work. `channelId`·`expiresDays` are
  already in the contract.
- ADR-0067's rejoin gate becomes, for the first time, a feature users actually see.
- A single room stays a persistent conversation with one person, so the same 1:1 doesn't pile up as multiple rooms
  in the list.
- Invite link lifetime shrinks from 3 days to 24 hours, narrowing the exposure window.

**What is accepted**

- **"Friend invited" doesn't persist as history.** The derived footer disappears once the peer returns, so the
  Figma 4055-13019 look — where that sentence stays visible above the messages even after rejoining — isn't
  reproduced. **Needs designer confirmation.**
- **You may have to re-enter the number on every reinvite.** True for a room where I was the invitee, a device
  switch, or a cleared localStorage. The underlying fact — that you can't reinvite without knowing the peer's number
  — remains.
- **Server permissions need real-world verification for whether a non-owner member can invite with `channelId`.**
  And whether accepting reactivates that channel's join instead of creating a new room, and whether `invite.list`
  rows retain `channelId`, also need confirming — all three are premises of decision 2 (spec-stage verification
  items).
- **Real-time awareness of a peer rejoining may not reach you while outside the app.** Whether the server pushes
  for the `join` system message can't be settled from client code alone — looking at the contract that excludes
  system messages from unread via `metaNo` (ADR-0048), it might not push. **A QA measurement item.** Even if it
  doesn't, the feature doesn't break — it just falls back to "correct once A opens the room."
- **Invite-state determination depends on `invite.list`'s 100-row window.** If an old invite gets pushed out of the
  window, the footer offers only "reinvite" without knowing the state — not a bad failure, but not accurate either.
- **~~"Friend name" can differ room by room.~~** Since the data is the channel nickname (decision 8), if there were
  two or more DM rooms with the same peer, each room would store its own value. ~~A duplicate DM can genuinely
  happen — "you already have a 1:1 with them" pre-detection doesn't exist yet (ADR-0089 D2, v1 unimplemented), so a
  room I created by inviting them and a room they created by inviting me can exist side by side.~~
  **Withdrawn (2026-09-18) — a duplicate DM cannot exist.** The id is pair-derived (decision 2's correction), so
  both directions of invite resolve to the same channel and the server has nowhere to put a second one. Simultaneous
  invites converge on one room rather than racing to create two. The per-person-alias migration this bullet
  anticipated therefore has no trigger; decision 8's mapping still holds on its own terms.
- **The departed-member display rule diverges between DM and group.** The same list component behaves differently
  by stereo, so one branch appears at the `hasLeftChannel` call site.
- **A DM room can't be deleted.** A room both sides have left stays on the server, opened by no one.
- **The 24-hour expiry also applies to new invites.** Users who relied on 3 days (an invite sent over a weekend)
  will see their link die sooner.

**Follow-ups**

- Request a `userId`-based reinvite API from the backend. Once it arrives, only decision 3's phone-entry step needs
  to be skipped — the rest of the UI stays as-is.
- The wiring ADR-0039 left as future work — auto-reflecting the friend name entered at invite time into
  `join.nick` — touches the same spot as decision 8. Sort out ownership at the spec stage.
- Designer confirmation on decision 1's footer disappearing (trade-off 1 above).
  </content>
