# ADR-0075: Add web channel members via a place-profile picker, placed as the invite page's default tab

> Status: Accepted · Decided: 2026-09-07
> · [ADR-0072](./0072-desktop-channel-member-add-and-join-cursor-placement.md) (desktop member add — **the first implementation of the same problem**. This ADR is the "second client" that document foreshadowed)
> · [ADR-0022](./0022-channel-invite-page-web-ui-kit.md) (apps/web invite page — batch contact invites, invite links. This ADR adds a tab onto that page)
> · [ADR-0015](./0015-channel-settings-ui-refresh.md) (channel settings UI, owner determination) · [ADR-0032](./0032-dm-chat-room-screen.md) (DMs are fixed 1:1, so no inviting)

## Context

### The requirement

An owner wants to add a **specific user who is already using this cloud** to a channel. The
mechanism is `ChannelRepository.inviteChannel` (`channel.invite`).

### What the server can offer — checked exhaustively

Of the socket actions, only **`channel.list-user` and `channel.sync-users` enumerate users, and
both are scoped to a single channel**. `place.*` has no member list, and `user.*` has no
directory-style action either. In other words, **there is no way to ask the server for "anyone in
this place."** The candidate pool has to be built by the client merging rosters — the same
constraint ADR-0072 ran into on desktop.

### What already exists

| Area                | Existing asset                                                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct-add API      | `ChannelRepository.inviteChannel` — `ChatInviteInput = { channelId, userIds[] }`. **Optimistic write, rollback, and response union are already in place** (added by ADR-0072)                            |
| App wrapper         | `inviteChannel` in [`useChannelMutations.ts`](../../apps/web/src/app/features/channels/hooks/useChannelMutations.ts)                                                                                     |
| Picker UI shell     | [`InvitePage.tsx`](../../apps/web/src/app/features/channels/pages/InvitePage.tsx) already combines `SearchInput` + `SelectableUserItem` + `SelectedAvatarRow` + `FloatingButton` multi-select            |
| Place profiles      | `profileRepository.observeList({ sid })` + cache-miss `refreshItem('${sid}@${uid}')` — the machinery behind [`useChannelProfiles`](../../apps/web/src/app/features/channels/hooks/useChannelProfiles.ts) |
| Owner determination | `ChannelSettingsPage`'s `isOwner = !!channel?.isOwner` — already gates the "add friend" row                                                                                                              |
| Precedent           | Desktop's `AddMembersDialog` + `useInviteCandidates` (ADR-0072). **Referenced only, not modified**                                                                                                       |

### Gaps

1. **No web UI calls `inviteChannel`.** The only web code in the repo calling this function is the
   wrapper itself; there are 0 screen call sites.
2. **The owner's "add friend" only goes through phone-number invites.** There is a flow for sending
   a link to someone without an account, but **no path for adding someone already in another room
   to this room.**

### Two ways web differs from desktop — these shaped the decision

1. **The member list is seeded differently.** Web's `ChannelSettingsPage` passes
   `channel.memberIds` into `useChannelMembers`, and the display name falls back in order:
   `profileMap` (place profile) → `member.name` → `memberId`. Since `inviteChannel` already updates
   `memberIds` optimistically, **the row appears the instant the invite happens.** Desktop reads
   members from the user cache's `channelIds`, and since the invite response doesn't touch that
   cache, it needed a separate write (ADR-0072 decision 2, second half). Web has no such trap.
2. **The owner gate already exists.** Desktop couldn't confirm whether `channel.invite` is
   owner-only, so it chose not to add a gate (ADR-0072 decision 5). Web already has an `isOwner`
   branch sitting right there.

## Decision

### 1. Split the invite page into two tabs, with **place as the default tab**

No new entry point is added — the settings screen's owner-only "add friend" row still goes to
`ROUTES.channels.invite(channelId)`, and the tab choice happens inside that page.

| Tab                 | Content                                                          |
| ------------------- | ---------------------------------------------------------------- |
| **Place** (default) | People already sharing a room with me in this place — **new**    |
| Contacts            | Device-contact batch invite + invite link — unchanged (ADR-0022) |

Why place is the default: in most situations, the person you want to add is **already in this
cloud.** Contact invite is a different product for reaching someone without an account, and that
case is rarer.

The two tabs have **separate selection state and separate confirm actions.** The place tab adds
immediately via `channel.invite`; the contacts tab builds a link via `user.invite-batch`. Selection
is not shared between tabs — sharing it would make one "confirm" button do two different things.

### 2. Candidates are gathered only within **the target channel's place**

`the union of members of my other channels under this channel's sid − this channel's current
members − myself`. Same definition as desktop's `useInviteCandidates`, for the same reason (no
server directory).

This is not widened to the whole cloud. **Place profiles are scoped by sid**, so someone from a
different place has no nickname or photo to show in this place at all. Channels also belong to a
place, so whether the server would even accept it is unverified. A scope that directly conflicts
with decision 3's display rule is not chosen.

There are two exclusion sources — the roster read results and the channel record's `memberIds`.
Even if a roster fetch fails, someone already in the room won't show up as a candidate (ADR-0072
uses the same defense).

### 3. Candidates are rendered with **place profiles**

Shown with the nickname/photo used in this place, not the name from the global user record. Since
the same screen (the settings member list) already renders that way, the person picked in the
picker and the person shown in the list after adding them **must not appear under different
names.**

The path mirrors `useChannelProfiles`: observe with `observeList({ sid })`, and fill only the
candidates missing from cache with a single `refreshItem('${sid}@${uid}')`. The fallback chain
matches the settings screen exactly: profile nickname → user record name → userId — so someone who
hasn't set up a place profile yet doesn't show up as a blank row.

Side effect: since the picker already warms the profile cache, the new row in the member list shows
**the correct name immediately** right after the invite.

### 4. Keep web's existing owner gate

`isOwner && !isDmChat`. Not switching to desktop's approach of surfacing server rejection via a
toast — every other row on web's settings screen already uses this determination, so opening just
this one would break the permission rule's consistency within a single screen. Even if the server
actually allows anyone, **the client erring narrower is the safe direction.**

`channel.invite`'s server-side permission rule is still unverified, carried over from ADR-0072. Once
confirmed, the gate is aligned to the server rule.

### 5. Candidate aggregation stays **in apps/web** — not promoted to `libs/data`

ADR-0072 foreshadowed "move it the day a second client needs a picker," but it is not moved.

- **desktop-web is not modified** (a work constraint). If desktop can't be swapped in, promoting it
  would result not in sharing but in a module that's _"promoted to be shared, but only one side
  uses it."_ The duplication stays, and the engine gains one more module with a single consumer.
- **The two implementations aren't actually the same.** Per decision 3, web renders with place
  profiles, while desktop renders with the user record. Since the data sources diverge, merging
  them now would produce a shared hook full of branches.

Once desktop modification opens up, the two implementations are placed side by side and merged.
Until then, this decision **defers** ADR-0072's forecast.

### 6. No direct user-cache write

Web does not adopt the second half of ADR-0072 decision 2 (writing the chosen record to the user
cache after a successful invite). As shown in §Two ways web differs from desktop, item 1, web's
member list is seeded from `channel.memberIds`, and `inviteChannel` already updates that field
optimistically. On web, that write would be **fixing a problem that doesn't need fixing.**

### Out of scope

- **Adding people to a DM.** 1:1 is fixed membership (ADR-0032). The existing `!isDmChat` gate stays
  as-is.
- **Behavior changes to the contacts tab.** It only moves inside a tab — the flow, copy, and API
  stay the same.
- **Finalizing `channel.invite`'s permission rule.** Requires backend confirmation first
  (decision 4).
- **A full place-member picker.** The server has no member-list API. If a new endpoint appears,
  decision 2 gets revisited.
- **desktop-web changes** — referenced only.
- **Showing an invite-pending state.** The existing problem that the join counter can't
  distinguish "invited but not yet entered" from "left" (`utils/membership`) remains as-is. No
  badge is drawn on a guess.

## Alternatives

**Add another row to the settings screen** — makes it clear from the entry point itself that the
two invites are different products. But an owner arrives with a single intent, "put someone in this
room," and would have to pick the mechanism before even getting in. A tab lets them pick after
entering, and the default tab matches the majority intent.

**Remove and replace the phone-number invite** — the path desktop took (ADR-0072 decision 4).
Rejected for web: unlike desktop, **web's contact invite is live in production and is the only path
to reach someone without an account.** Removing it would remove a shipped product feature.

**Gather candidates across the whole cloud** — the user's initial framing of the scope. Rejected
for the reasons in decision 2. Place profiles are sid-scoped, so there's no name to display, and
server acceptance is unverified.

**Manual userId entry** — the smallest build. But web is a mobile-width screen with no place to
paste an id from (desktop's profile popover copies the id). Leaving the search box able to match by
id means pasting still works.

**Generate an invite link by userId** — the server has no such route. Not possible without a new
spec (same as ADR-0072).

## Consequences

- **`channel.invite` is called from a screen on web for the first time.** Until now this API only
  had a wrapper with no call site.
- **The invite page now holds two products.** The contacts tab is untouched, but the page gains a
  tab shell, and if `web-ui-kit` has no in-page tab control, one is added there — not improvised on
  the screen.
- **Desktop and web end up with two nearly-identical candidate hooks.** This is intentional debt,
  and repayment is pinned to the day desktop-web modification opens up (decision 5).
- **The candidate hook fires one request per channel.** Mounted only while the picker is open.
  Desktop constrains itself the same way for the same reason.
- **Behavior when the socket is unverified needs deciding.** Desktop serves the cache pool because
  of the indefinite-unverified path after sleep/wake, then re-runs the network path on the
  false→true edge. Web has the same option available and confirms it at the spec stage.
- **Two open items remain**: `channel.invite`'s server permission rule (decision 4), and the design
  source for the in-page tab control (needs a Figma check).
