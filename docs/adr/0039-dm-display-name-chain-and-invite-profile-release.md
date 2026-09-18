# ADR-0039: Unify the DM display name chain and drop the forced profile on invite accept

> Status: Accepted (decision 5 is Superseded) · Decided: 2026-07-31
>
> **Decision 5 was withdrawn by [ADR-0041](0041-place-profile-as-invite-precondition.md)** (2026-08-03).
> Decisions 1 through 4, about the display name chain, still hold.

## Context

After ADR-0032 built the 1:1 (DM) screen, three places were left out of step over display names.

| Place       | Today                                                                                                          | Problem                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Room header | `dmPeer?.nick` alone (`apps/web/src/app/features/channels/pages/ChannelRoomPage.tsx:121`)                      | it does not look at my own `join.nick`                                         |
| Home list   | `resolveChannelTitle` has no `'dm'` branch (`apps/web/src/app/features/home/lib/resolveChannelTitle.ts:38-40`) | an unnamed DM shows up as "Unnamed chat"                                       |
| Room body   | no intro                                                                                                       | the first screen says neither who the other person is nor what the room is for |

The most visible result is **the same room appearing under two names**. A DM created from an invite has
no `channel.name`, so on home it is "Unnamed chat", but open it and the header switches to the peer's
nick. The owner branch of the home list uses `channel.name` and **ignores** my `join.nick`, and the owner
of a DM is the person who sent the invite, so this divergence always happens on the inviter's side.

Facts confirmed during the investigation drove the decision.

1. **`join.nick` is "the name I gave this room"** — not a person's name
   (`apps/web/src/app/features/channels/types/index.ts:26`, `apps/web/src/app/utils/channel.ts:13`). The
   things that write it are `UpdateChannelDialog` and `SelfChatNameDialog`, and ADR-0032 decision 3
   closed that entry for DMs. In other words, **nothing writes a DM's `join.nick` today.**
2. **The first line of the Figma intro is a string that already exists.** `chat.room.system.join` =
   `"님이 채팅방에 입장했습니다."`, identical down to the characters. Today it is rendered inside the
   stream as a centred pill (`SystemNotice`), and because of the `isOwnSystemChat` filter, **only the
   peer's join message** is visible.
3. **A component is already waiting for somewhere to be used.**
   [`SystemMessage.tsx`](../../libs/web-ui-kit/src/composites/chat/SystemMessage.tsx) is defined and
   exported in the kit but has no consumer, and its doc comment is exactly this case
   (`"<친구>님이 채팅방에 입장했습니다."` + `"1:1 대화를 시작해 보세요."`).
4. **The forced profile is one line.** `if (!latest.current.nick) return setPhase('profiling')` in
   `apps/web/src/app/features/invite/accept/hooks/useRelayInviteFlow.ts:237`. And commit `98a4685ff`
   (2026-07-28) already removed the forced profile on entering a place, so **this relay accept path is
   the last forcing point left in the app.** A profile does not block entering a DM
   (`apps/web/src/app/features/invite/accept/hooks/useEnterInvitedChannel.ts:11-14`,
   `apps/web/src/app/features/home/pages/HomePage.tsx:184-188`).
5. `profileMap` is only filled for `activeMemberIds`
   ([useChannelProfiles.ts](../../apps/web/src/app/features/channels/hooks/useChannelProfiles.ts)) — a
   pending peer who has not accepted yet has no profile entry, so it falls back to the user cache.

## Decision

### 1. Unify the DM display name chain into one

**my `join.nick` → the peer's `profile.nick` → `channel.name` → the shared label**

> **Revised during implementation (2026-07-31)** — the original last step was the peer's `user.nick` /
> `user.name`. That value is only filled by a per-channel `syncChannelUsers` network call
> (`useChannelMembers.ts:75`), so a list screen cannot get it cheaply, and putting it in the chain
> **revives the very divergence this ADR set out to fix, with only the room answering differently.** So
> it was changed to `channel.name`, which all four screens already have. That the `***<last 4 digits>`
> display name is now shown nowhere also fits decision 3's "if there is no name, say there is no name".

The room header, the room settings screen, the home list, and the chat room management list **all use the
same chain.** `useDmPeer` already has the last two steps, so `join.nick` is added on top, and a `'dm'`
branch is added to `resolveChannelTitle` so it intercepts before the owner/member branch. In DMs,
`channel.name` is not consulted.

### 2. Bring back renaming a DM room — withdrawing ADR-0032 decision 3

Reopen the "Change room name" row that `ChannelSettingsPage` closed for DMs, and have it record
`join.nick`. `join.nick` is top of the chain in decision 1, and with no path that writes it, that
priority would be a permanently dead branch.

Meanwhile, **wiring the friend name entered at invite time (`invite.create({ phone, name })`) through to
`join.nick` automatically is out of scope here** — someone else is doing it separately. Until then, a DM
name falls back to the peer's profile unless the user names it themselves.

### 3. The first block of the body: the static intro and the system message **coexist**

- The kit's `SystemMessage` gets its **first consumer** (two lines: a bold title plus supporting text).
- Its position matches the self-chat intro — directly below the oldest date divider (`isOldestGroup`),
  matching Figma's `[date][intro][messages]` order.
- **It is always shown.** It appears even in the empty state with no messages → **ADR-0032 decision 5 is
  withdrawn** (DM empty state = "no bubbles").
- The name uses **only the peer's `profile.nick`** (not the chain from decision 1 — this sentence states
  the fact that someone joined, so putting my own alias in it would read oddly). When there is no
  `profile.nick`, **a generic name-free string is used instead**. New i18n keys are needed (two titles
  plus one description). The copy for the name-free variant is ours, so it is a designer confirmation
  item (draft: `"대화 상대가 채팅방에 입장했습니다."`).
- **The existing join/leave `SystemNotice` pill is left alone.** The same sentence appearing on one
  screen in two shapes is accepted as intended.

### 4. The DM row on the home list

- Title: the chain from decision 1. Peer profiles are **collected across the DM rows' peer ids and
  fetched in one batch for the whole list** (extract peer ids from `channel.memberIds` →
  `useChannelProfiles(sid, peerIds)`). There is no per-row subscription.
- Avatar: the peer's `thumbnail`. When absent, the one-person glyph fallback — matching the room header.
- The member-count pill is hidden: a DM is always two people, so it carries no information.

`resolveChannelTitle` is shared with `PlaceChannelManagePage`, so the change lands on both screens
together.

### 5. Delete the `profiling` step from invite accept entirely — revising ADR-0089 D10

> **Withdrawn (2026-08-03, [ADR-0041](0041-place-profile-as-invite-precondition.md))** — this decision was
> reversed. The order is **auth → profile → accept** again, and the `profiling` step is restored in front
> of `invite.accept`. The reasoning is a failure mode this decision did not account for: if the profile is
> deferred to **after** accepting, a user who force-quits the app in between is **left in the DM with no
> name and no way to undo it.** Instead of standing up a forcing gate, ADR-0041 makes saving the profile a
> precondition of `invite.accept` (pressing X returns without accepting), which preserves the "zero forced
> profiles anywhere in the app" this decision won. The code the decision below deleted
> (`RelayInviteProfileDialog`, `useSaveMyPlaceProfile`, the `'profiling'` phase) is brought back in
> `5a61669a5`. The trigger, though, is a three-state check rather than the original's bare `!profile?.nick`
> — an empty form appearing spuriously would overwrite an existing profile.
>
> The consequence item below, "the i18n `placeProfileCreate.*` (16 keys) became dead copy", is resolved
> along with it.

The accept order becomes **auth → accept**.

- Remove `'profiling'` from `RelayInvitePhase`, delete `RelayInviteProfileDialog.tsx`, and remove the
  corresponding branch and `onProfileSaved` from `RelayInviteAccept`.
- Clean up the `relayInviteAccept.profile.*` i18n keys (ko/en).
- Fix the profile-order tests in `useRelayInviteFlow.test.ts` and `RelayInviteAccept.test.tsx`.
- Update S1 step 7 and the relay state diagram in docs/invite-accept-entry.md, which lived in the root
  docs tree, since removed (delete the `submitting --> profiling` edge).
- `PlaceProfileFormDialog`, `PlaceProfileForm`, and `useSaveMyPlaceProfile` **stay** — they are the path
  used by the place settings hub (ADR-0031) and the home dropdown. The profile is set there, later.

### Out of scope

- Wiring the name entered at invite time through to `join.nick` (proceeding separately)
- New backend requests (denormalizing `stereo`, `memberCount`, and the like)
- The display rules of the group and self screens — untouched
- Re-prompting UX for users with no profile (banners, toasts, and so on)
- Cleaning up the legacy `InviteDialog` still in `HomePage` (ADR-0038's remit)

## Alternatives

**Handle the intro by replacing how the join system message renders** (pill → a `SystemMessage` block) —
this was the cleanest in that there is no duplicated copy and it is grounded in real data. It was dropped
for two reasons. In a pending DM where the peer has not accepted yet, nothing appears at all; and once
messages pile up, the block's position is tied to stream arrival order, so "first thing in the body"
cannot be guaranteed.

**Fall back to `user.name` when `profile.nick` is missing** (= the same chain as the header) — this has
the advantage that the header and the sentence always agree on the name, but a phone-number user's display
name looks like `***1234` (ADR-0089 D10), and `"***1234님이 채팅방에 입장했습니다."` does not read. The
name-free generic string was chosen instead.

**Call `useDmPeer` per row in the home list** — the logic would become exactly the same as the room
screen, but it creates as many profile subscriptions as there are rows. The batch fetch was chosen.

**Soften the profile step to "skippable"** — the cost of maintaining the dialog remains, and the state of
having one interrupting step right before accepting stays exactly as it is. Deletion was chosen.

**Leave ADR-0032 as it is and keep DM renaming disabled** — this collides head-on with the requirement
that `join.nick` come first. Dropped.

## Consequences

**What is gained**

- The divergence where the same DM shows different names on home and in the room disappears. The display
  name converges on one chain across four screens.
- Invite accept loses one forced step, so there is one less place to drop off, and **the app has zero
  forced profiles anywhere** — the finish of the cleanup that started on 2026-07-28.
- The first screen of a 1:1 room says who the other person is and what the place is for. The silence of
  the empty state goes away too.
- The kit's ghost component (`SystemMessage`) gets a consumer. There are no new kit components.

**Trade-offs accepted**

- **There will be more peers with no profile.** That is the direct result of removing the forcing. The
  revision to decision 1 means `***1234` is no longer shown, but in its place comes `channel.name` (a
  server-decided value) or the generic label "Chat partner". Until the `join.nick` write path is wired,
  this state is **the default**, and the user naming the room themselves (decision 2) is currently the
  only way out.
- **It is unconfirmed whether `channel.name` is actually filled for relay DMs.** If it is empty, the third
  step of the chain is effectively a dead branch and every peer with no profile shows as the generic label
  (the behaviour is still correct).
- **The i18n `placeProfileCreate.*` (16 keys) became dead copy.** The only thing reading that namespace was
  the deleted `RelayInviteProfileDialog` (the remaining profile UI uses `placeProfileEdit.*`). They were
  kept rather than deleted, because the "re-prompting UX" deferred as out of scope may use them.
- The same sentence appears on one screen in two shapes (a centred pill and a left-aligned block).
- Renaming a DM room is open again, so the simplicity ADR-0032 won — "a DM's name is always the peer" —
  is lost. Even if the peer changes their profile name, the name I gave keeps winning (the intended
  priority).
- The home list gains one profile subscription. In a place with no DMs it is an empty array and so costs
  nothing, but in a place with many DMs the list render reacts once more when the profiles arrive.
- ADR-0032 loses two of its five decisions and drops to **Superseded**. The remaining decisions (DM
  identification, `kind='direct'`, the read '1' badge) are inherited by this ADR.
- Of the three new i18n keys, the copy for the name-free variant starts out unconfirmed by the designer.

## References

- [ADR-0032](0032-dm-chat-room-screen.md) — superseded by this ADR (decisions 3 and 5 withdrawn)
- [ADR-0089](0089-relay-dm-invite-and-auth-parallel-tracks.md) D10 — revising the accept step order
- [ADR-0020](0020-place-profile-edit-dialog.md) · [ADR-0031](0031-place-settings-hub.md) — the remaining
  paths for setting a profile
- [ADR-0035](0035-relay-invite-accepted-channel-resolution.md) · [ADR-0037](0037-invite-accept-popup-group-and-dm-variants.md)
- [apps/web/docs/feature/channels/dm-chat.md](../../apps/web/docs/feature/channels/dm-and-self-chat.md) — the
  feature doc for the DM display rules (decisions 1 through 4)
- docs/invite-accept-entry.md, which lived in the root docs tree, since removed ·
  [apps/web/docs/feature/invite/relay-invite-accept.md](../../apps/web/docs/feature/invite/relay-invite-accept.md)
  — the accept flow (decision 5)
- Figma: `3086-14439` (the intro block) · `3086-14299` / `3399-26059` (the whole 1:1 room) ·
  `3080-12440` (the profile screen being deleted)
