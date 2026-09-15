# Group channel settings rework — a sectioned list layout with an inline notification toggle

## Status

accepted

Decided: 2026-07-20

Partly supersedes: [ADR-0015](0015-channel-settings-ui-refresh.md) — decision #1 (the chat room
settings layout) and #4 (notifications in their own dialog).

## Context

The group channel settings screen (`Room settings`) was redesigned again in the new DoU design (Figma
file `ViwLfjc5Eoq7BpEXFfFj3W`).

- Owner view: node `3164-12510` ("Group room #owner settings")
- Invited member view: node `3164-14262`

The target is one screen, `apps/web/src/app/features/channels/pages/ChannelSettingsPage.tsx`, whose UI
branches on owner vs. invited member.

### How this relates to ADR-0015 (the important part)

[ADR-0015](0015-channel-settings-ui-refresh.md) (2026-07-16) already reworked the channel settings
screen against **the previous Figma batch (nodes 2935-\*)**, and that result is **the current code** —
icon action buttons at the top (invite friends · notifications · delete room) over a centred room info
layout.

The new nodes (3164-\*) move to a **sectioned list layout**. Crucially, ADR-0015 saw this "sectioned
list plus inline notification toggle" layout as **1:1-chat-only and explicitly excluded it**
([0015 lines 89-92](0015-channel-settings-ui-refresh.md)) — but the new node is named "Group room
#owner settings", so the design has evolved and **the layout now applies to group rooms too**. This
work therefore reverses decisions #1 and #4 of ADR-0015.

### Current implementation vs. the new design

| Element           | Today (ADR-0015)                          | New design (3164-\*)                                          |
| ----------------- | ----------------------------------------- | ------------------------------------------------------------- |
| Room name         | Centred avatar plus an underlined "Edit"  | A left-aligned row (avatar + name + `>` chevron)              |
| Room notifications | Icon button at the top → dialog           | An **inline toggle switch** in the "Room settings" section    |
| Add friends       | Icon button at the top                    | A **list row** in the "Room friends" section (+ icon, owner only) |
| Delete / leave    | Icon button at the top                    | **Red text at the bottom** (delete room / leave room)         |
| Member badges     | Owner = green checkbox · MY = navy pill   | Owner = green text pill · MY (same) · Invitation pending (grey) |

### Domain constraints (the important part)

- **There is no field that expresses "invitation declined".** `JoinModel.joined` is binary (`0` = not
  joined or left, `1` = joined), and `JoinStereo` is a role (owner/admin/member), not a state. The
  front end alone cannot tell "invitation pending" from "invitation declined".
- **There is no notification mutation.** As in ADR-0015, there is no backend write for per-member
  notifications, so the toggle stays local state (unwired).
- Owner detection reuses the existing `channel.isOwner` (`ownerId === myUid`).
- Pending-invitation detection reuses the existing `$join.joined === 0`.
- **Group chat detection**: `ChannelStereo` is `'' | 'dm' | 'self' | 'public' | 'private'`, and
  anything that is **not** `dm` or `self` is a group chat (`''`, `public` and `private` all count).
  This screen targets group chats, and the existing `isSelfChat` (`stereo === 'self'`) branch stays.

## Decision

### In scope

1. **Restructure the `ChannelSettingsPage` shell as a sectioned list** — replace the icon action
   buttons at the top with:
    - **The room name row**: left aligned (avatar + name + `>`), tappable by owner and member alike.
      An owner's tap opens the existing `UpdateChannelDialog` (edit); a member's tap opens a read-only
      room info dialog.
    - **A "Room settings" section** → the **inline room notification toggle** (on/off).
    - **A "Room friends" section** → the add-friend row (owner only, opening the existing
      `InviteFriendsDialog`) plus the member list.
    - **Red text at the bottom** → delete room for an owner, leave room for a member (reusing the
      existing `ConfirmDialog`).
2. **Rework the member badges** — give `MemberListItem` the new badges: owner (green text pill), MY
   (navy pill, unchanged) and invitation pending (grey pill, `$join.joined === 0`). The owner badge
   shows on the owner's row, the MY badge on my own.
3. **Notifications become a plain on/off inline toggle** — simplified from the three-way dialog (all /
   mentions / off). No data wiring (local state). The existing `RoomNotificationDialog` goes unused on
   this screen.
4. **Components come from `@chatic/web-ui-kit`** — reuse the primitives that exist: `Switch`,
   `Badge` / `StatusBadge`, `SectionHeader` / `GroupLabel`, `ListRow`, `Avatar`, `Divider`. A missing
   badge variant (owner, invitation pending) or row combination is defined in the library first
   (stateless, slot-based, i18n-agnostic label props, tokens, with `*.test.tsx` and `*.stories.tsx`
   alongside — inherited from ADR-0010 / 0013 / 0015).
5. **Icon resources** — standard icons (chevron, plus, toggle) reuse what exists (lucide /
   web-ui-kit); any custom Figma glyph is extracted into `web-ui-kit/resources/icons` first.

### Out of scope

- **The "invitation declined" badge and state** — follow-up work for when the backend offers a state
  distinct from pending. Only "invitation pending" this round.
- **Real data wiring for notification settings** — it needs a new backend mutation (same as ADR-0015).
  It stays UI only.
- **Restyling the dialogs this screen opens** (info editing, profile detail) — only the shell is
  replaced, and the existing dialogs are reused. The read-only room info view for members is included
  as a small addition, but applying the new design to it waits for its own node.
- **Report** — hidden in Figma, so out of scope.
- **The 1:1 (self) chat layout** — the existing `isSelfChat` branch stays unchanged.

## Alternatives

- **Supersede ADR-0015 entirely** — 0015 still holds valid decisions about info editing, profile
  detail and the confirmation dialogs, so rather than discarding it, only the reversed decisions #1 and
  #4 are partly superseded, and the two link to each other.
- **Derive "invitation declined" from an existing field such as `reason`** — no guarantee the data is
  there, so it risks showing the wrong thing. Excluded until the backend signal is settled.
- **Keep the three-way notification dialog (all / mentions / off)** — it contradicts the new design's
  on/off toggle. The design wins and the toggle is adopted.
- **Show add-friend based on `inviteRule === 'all'`** — it exists in the model, but the design marks
  the row owner-only. Owner-only stands, with `inviteRule` support considered later.

## Consequences

- **What is gained**: the group channel settings screen moves to the current sectioned-list design, and
  the owner / member split reads clearly through the badges and the bottom action. Reusing proven
  web-ui-kit primitives (Switch, Badge, Section, ListRow) keeps new components to a minimum.
- **The trade-off**: the notification toggle is still local state (unwired) and resets on reopen — say
  plainly that it is UI-only so expectations are managed. "Invitation declined" exists in the design
  but not in the implementation, so a gap between the two remains until the backend is ready.
- **Related**: [ADR-0015](0015-channel-settings-ui-refresh.md) (the previous channel settings rework,
  partly superseded), [ADR-0010](0010-chat-screen-webuikit-rebuild.md) (the web-ui-kit rebuild
  principles), [ADR-0013](0013-home-screen-web-ui-kit-migration.md) (the migration pattern).
