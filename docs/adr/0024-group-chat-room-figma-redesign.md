# ADR-0024: Redesign the group chat room screen (header avatar stack, total member count, read status)

> Status: Accepted · Decided: 2026-07-20

Related: a follow-up to [ADR-0021, the chat room Figma refinement](0021-channel-room-figma-refinement.md).
It does not replace 0021; it extends the header and the read status.

## Context

The group chat room screen (`apps/web/src/app/features/channels/pages/ChannelRoomPage.tsx`) has an
updated design to apply. Reference Figma:

- Empty state: `node-id=3209-26754`
- With messages: `node-id=3209-27020`

The requirements:

- Show the participant avatars at the top — **the owner leftmost, at most 5** — followed by the
  **channel's total member count**.
- Improve the message bubble design.
- Components come from [`@chatic/web-ui-kit`](../../libs/web-ui-kit); a missing component is defined in
  that library first.
- Where an icon is needed, obtain the resource (following the web-ui-kit `resources/icons`
  convention).

**What comparing Figma against the code found — the basis for narrowing the redesign:**

| Item                        | The code today                                                                                   | Figma                                                    | Verdict                    |
| --------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | -------------------------- |
| My bubble colour            | `--bubble-mine` = #102346                                                                          | #102346 (`blue_bk`)                                       | Already matches            |
| Read accent colour          | `--main-accent` = #90C304                                                                          | #90c304 (`main2_Color`)                                   | Already matches            |
| Bubble padding, radius, tail | `px-[14px] py-2`, 18px radius, one square corner (mine top-right, theirs top-left)                 | The same (14/8 padding, the same tail)                    | Already matches            |
| Message avatar size         | 39px (`size-[39px]`)                                                                               | 32px (`1-person Profile` 32×32)                           | **Change needed**          |
| Read status                 | The unread **number only**, in `--main-accent`                                                     | `read N` (green) · `unread N` (grey), labels split by a bullet (•) | **Change needed (behaviour and visuals)** |
| Header                      | One avatar plus the title (one line)                                                               | The title (line 1) plus an **avatar stack and total count** (line 2) | **Change needed**          |
| Empty state body            | "Invite friends" already built                                                                     | The same                                                  | No change (header only)    |

So the bubble's colour, radius, padding and tail already match Figma. The real changes are three:
**① a two-line header (avatar stack plus total), ② expanding the read status into read and unread, and
③ 32px message avatars.**

Every piece of data needed already exists: `channel.ownerId`, `channel.memberCount`, `activeMemberIds`,
`profileMap` (nick and thumbnail) and `getReadCount` (which returns readCount and unreadCount
together). So do the components:
[`AvatarGroup`](../../libs/web-ui-kit/src/foundations/avatar/AvatarGroup.tsx) (an overlapping stack
plus a count, 6px overlap — matching Figma), `ImageAvatar` / `DefaultAvatar`, `IconGroup` /
`IconChevronRight`. No new icon resource is needed.

## Decision

### In scope

1. **Add a participant meta row to the header.** Give
   [`ChatRoomHeader`](../../libs/web-ui-kit/src/composites/header/ChatRoomHeader.tsx) an optional `meta`
   slot rendered under the title (a two-line structure). Only a group channel passes the avatar stack
   and total into it.
    - The stack reuses `AvatarGroup` with `max={5}`. The page assembles the avatar nodes: **the owner
      (`channel.ownerId`) leftmost**, then the rest in `activeMemberIds` order. Each avatar resolves
      through `profileMap` (nick and thumbnail), then the member user cache, falling back to
      `DefaultAvatar` with no thumbnail. 20px circles, 6px overlap (matching Figma).
    - **The total is `channel.memberCount`** (everyone, me included). An empty room shows `1`.
2. **Expand the read status into read and unread.** Extend
   [`ReadReceipt`](../../libs/web-ui-kit/src/composites/chat/ReadReceipt.tsx) to render `read N`
   (`--main-accent` green) · a bullet (•) · `unread N` (`text-description` grey). It takes
   `readCount` / `unreadCount` and `readLabel` / `unreadLabel` as props.
    - When it shows: the existing group condition (`showReadReceipt && isReady`) stays. When shown,
      `read N` is always visible and `unread N` appears only while `> 0` (the bullet only when both
      are present). Once everyone has read, `read N` remains alone — today nothing showed at all.
    - Placement: for their messages, `time · [read · unread]`; for mine,
      `[read · unread] · time` (time outermost). `MessageRow`'s existing `flex-row-reverse` logic
      already produces this.
3. **Message avatars go from 39px to 32px.** Set the avatar and spacer in
   [`ChannelMessageRow`](../../apps/web/src/app/features/channels/components/ChannelMessageRow.tsx) to
   32px. The placeholder icon used when there is no avatar moves from a direct `lucide` import to the
   web-ui-kit `resources/icons` barrel.

### Out of scope

- The self chat (`self`) and 1:1 DM headers — no avatar stack or total (no `meta` passed). This
  refinement is for group channels only.
- Bubble colour, radius, padding and tail — they already match Figma, so they are left alone.
- What tapping the header avatar or title does — unchanged (the ⋯ menu still opens room settings).
- Message fetching, sending, scrolling and read marking — unchanged.

## Alternatives

- **A group-only `GroupChatHeader` composite** — rejected. `ChatRoomHeader` already has back, title,
  avatar and the more menu, so adding a `meta` slot is the smaller change. A separate component would
  fork the header logic in two and invite drift.
- **Keep the unread-only number and restyle it** — rejected. Figma spells out `read N · unread N`, and
  `getReadCount` already supplies both, so the read-receipt UX wins.
- **Pass an assembled node into the header's `avatar` prop** — rejected. The two-line (title plus meta)
  layout cannot align through a single avatar slot. A structural slot is the right shape.

## Consequences

- `ChatRoomHeader` gains two-line support, so the meta row can be reused for other channel types later.
  Existing callers (DM, self) pass no `meta` and are unaffected.
- `ReadReceipt`'s props change (unread-only → read plus unread), so every consumer has to be updated.
  There is a UX change: a fully read message now shows `read N`, where it used to show nothing.
- `ChannelRoomPage` additionally subscribes to `members` (or `total`) from `useChannelMembers` and
  owns the avatar assembly logic (owner-first ordering).
- The bubble itself is untouched, so regression risk is low and the change stays confined to the
  header, the read status and the avatar size.
- Next step: this ADR feeds the spec phase (Phase A) of dev-2_implement.
