# ADR-0032: The 1:1 (DM) chat screen

> Status: Superseded by [ADR-0039](0039-dm-display-name-chain-and-invite-profile-release.md) · Decided: 2026-07-27
>
> ADR-0039 withdraws **decision 3** (a DM room name cannot be changed, and the header always derives
> from the peer's nick) and **decision 5** (an empty state means no bubbles), and changes the header name
> to a `join.nick`-first chain. The other decisions (DM detection, `kind='direct'`, the read '1' badge)
> carry over into ADR-0039.

## Context

`ChannelRoomPage` already handles self and group chats, but `stereo === 'dm'` was left unhandled with
only a "not special-cased yet" comment. The 1:1 chat screen has to be added.

What the survey of the existing code found:

- **Delete vs. leave is already built.** `ChannelSettingsPage` branches on `isOwner` so the inviter
  (owner) deletes and the invitee (member) leaves. In a DM the inviter is the owner, so this works with
  no extra work.
- `ChatRoomHeader` already defines `kind='direct'` (with a one-person glyph fallback), but the page only
  ever passes `self` or `group`.
- `isGroupChat` is already computed as `stereo !== 'dm'`, so the group-only participant stack (meta) does
  not appear in a DM.
- The group `ReadReceipt` format is "read N · unread M".

Constraints: components come from `@libs/web-ui-kit`, and anything missing is defined there. A DM is
identified by `stereo === 'dm'`.

## Decision

### In scope

1. **DM detection**: derive `isDmChat = channel.stereo === 'dm'`.
2. **Header**: `kind='direct'`. The title is **the peer's `profile.nick`** (the member who is not me),
   and the avatar is the peer's thumbnail. The peer is identified from the roster as the member whose
   `userId` is not mine, preferring the site profile's nick and thumbnail (`profileMap`) and falling back
   to the user cache (`member.nick` / `name`).
3. **No room renaming**: a DM's room name **cannot be changed**, and the header always derives from the
   peer's nick. On `ChannelSettingsPage`, a DM's "Change room name" row no longer opens the edit dialog,
   and the "Add friend" row is hidden. (The notification toggle, the member list and delete/leave stay.)
4. **Read status (the KakaoTalk-style '1' badge)**: in a DM, show `1` beside a message while the peer has
   not read it, and remove it once they have. Add a DM display mode to `ReadReceipt` (a `mode` or
   `variant` prop) that renders only the unread count (0 or 1) as a badge. The `showReadReceipt`
   condition (`!isSelfChat && activeCount >= 2`) is already true in a DM, so it is reused as is.
5. **Empty state**: in a DM, **no bubbles is the initial state**. The group empty state's "Invite" CTA is
   not shown in a DM (gate the empty-state branch on `!isDmChat`).

### Out of scope

- A DM room renaming UI or policy (settled as not changeable, with no separate feature).
- New web-ui-kit components: `ChatRoomHeader`, `MessageInput` and the rest are reused, and the read status
  only adds a mode to the existing `ReadReceipt` (no new component needed).
- The DM channel creation flow (this screen only opens a DM channel that already exists).

## Alternatives

- **Reuse the existing "read / unread" format for the read status**: with one peer it naturally caps at
  1, but the KakaoTalk-style '1' badge fits the requirement ("read count at most 1") and the UX better,
  so it was not adopted.
- **Allow DM room renaming**: the header derives from the peer's nick, so a custom name would collide
  with it and the meaning would blur. Excluded.
- **New DM-specific header and read-status components**: `kind='direct'` plus a `ReadReceipt` mode is
  enough, so nothing new (YAGNI).
- **Add guidance copy to the empty state**: Figma's initial state is "no bubbles", so it is unnecessary.

## Consequences

- What is gained: the DM screen is finished with a minimal change. Delete/leave and the group-exclusion
  logic already exist, so most of it is reuse. The header, the composer and the read status stay in one
  component family with the group screen.
- Trade-offs:
    - Before the peer accepts the invite (join `joined === 0`, pending) they are absent from
      `activeMemberIds`, so the header nick has to come from the roster or the user cache fallback. While
      the profile is still loading, the fallback name may briefly show.
    - `ReadReceipt` gains a mode branch, making the component slightly more complex (the group count vs.
      the DM badge).
    - A DM room name can never be changed (an intended constraint of the policy).
