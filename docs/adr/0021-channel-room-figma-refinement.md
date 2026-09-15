# ADR-0021: Refine the channel (chat) screen against the Figma design

> Status: Accepted (some items superseded) · Decided: 2026-07-20
>
> ⚠️ [ADR-0024](0024-group-chat-room-figma-redesign.md) reverses two of the decisions below:
> ① the header member avatar stack and count are **brought back** (owner leftmost, at most 5, total
> count), and ② the numeric read status (unread only) is **expanded again into two parts,
> `read N · unread M`**.
> The other items — left-aligned empty state, the floating date pill, `IconGroup` /
> `DefaultAvatar variant`, the `#102346` bubble — still hold.

## Context

The design of the channel (chat) screen in `apps/web/src/app/features/channels` was refined, and the
code has to follow. The implementation is `@chatic/web-ui-kit` based, and a missing component is
defined in that library first. The precedents are [ADR-0010](0010-chat-screen-webuikit-rebuild.md)
(the web-ui-kit rebuild of the chat screen) and
[ADR-0014](0014-home-screen-figma-visual-refinement.md) (the home screen's Figma refinement).

Reference Figma:

- Empty state (no members, no messages): node `3143-23729`
- Accumulated chat (scrolling, see all): node `3188-24125`

The main gaps between the implementation and Figma:

| Item                  | Today                                                                            | Figma                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Header                | Name **centred**, no channel image, a member avatar stack and count below (`meta` row) | **Channel image plus name, left aligned**, no member stack                                                 |
| Empty state           | Centred, a circular icon, "Invite" (Plus, solid button)                            | Left aligned, the copy under a date divider, "Invite friends" (chevron, outline button), no circular icon   |
| Scroll date           | `DateDivider` only                                                                | A floating date pill at the top right while scrolling ("7. 01 Mon")                                        |
| Icons                 | lucide wrappers (placeholders, to be replaced)                                     | Figma's own glyphs                                                                                         |
| See all (long message) | Present (200-character truncation)                                                | Present (kept)                                                                                             |

Technical facts:

- The header is the shared `libs/web-ui-kit/src/composites/header/ChatRoomHeader.tsx`, and the channel
  room always renders it as `kind="group"` (centred, with the `meta` row). The `direct` variant already
  has the [avatar + name, left aligned] shape.
- Channel data carries a `thumbnail` field (`channel?.thumbnail`, already used on the settings screen),
  so it can source the header's channel image.
- Icons are managed as lucide wrappers in `libs/web-ui-kit/src/resources/icons/index.ts`, with a
  comment marking them "placeholders, to be replaced with Figma SVGs". `IconUsers`,
  `IconChevronRight`, `IconImage` and `DefaultAvatar` (one person, `IconUser`) exist.

## Decision

### In scope

1. **Rebuild the header** — replace `ChatRoomHeader`'s `group` variant itself with the Figma version.
    - [channel image (`thumbnail`) + name], **left aligned** (in effect converging with `direct`).
    - The member avatar stack and count (the `meta` row) are **removed entirely**.
    - A channel with no `thumbnail` shows a **default group avatar** (a dark circle with a group glyph,
      based on `IconUsers`). Add that group counterpart to the existing single-person `DefaultAvatar`
      in web-ui-kit.

2. **Redesign the empty state (no messages)** — layout and styling only.
    - Centred with a circular icon → **left aligned**, the guidance copy under a date divider plus an
      **outline "Invite friends" button (chevron right)**.
    - **The gating logic stays as it is** (the invite guidance and button appear only for the owner,
      non-guest, with an active cloud). The self-chat variant (the PenLine guidance) also stays.

3. **A floating date pill while scrolling** — new. While scrolling, show the date of the currently
   visible message as a sticky pill at the top right ("7. 01 Mon"). This needs scroll-position
   tracking.

4. **Icon resources** — the icons this screen uses (the default group avatar glyph, the chevron, the
   read status) are **extracted as Figma SVGs** into the web-ui-kit icon resources, turning some
   placeholders into real assets.

5. **Refine the message bubble and list** — bring `MessageBubble` / `MessageRow` styling in line with
   the Figma tokens (mine = the navy `blue_bk #102346` family, other = greys, radii and spacing, the
   read status, the time format). See all (long message truncation) behaves as before.

Every new or missing component is defined in `@chatic/web-ui-kit` first.

### Out of scope

- Changing the gating logic for the empty state.
- Restructuring the chat fetch, scroll and infinite-loading logic (`useChatScroll` and friends) beyond
  the scroll observation the floating date pill needs.
- Changing what the header's right-hand ⋯ menu contains.

## Alternatives

- **Header: add a new variant or prop and keep `group`** — backwards compatible, but the channel room
  turned out to be the only consumer, so it would only complicate the API. → Replace the `group`
  variant itself.
- **Keep the header member count and stack** — leaves the member information in the header. Figma has
  only the channel image and name there, so the information structure is simplified and they go.
- **Relax the empty-state gating so every member sees it** — Figma shows it unconditionally, but
  handling an invite button for members without permission is a burden, and the existing product logic
  wins. Gating is preserved.
- **Leave the floating date pill for later** — defers the cost of scroll tracking. Decided to include
  it in this round.
- **Keep the lucide icons** — fastest, but the glyphs are actually on screen, so extracting the Figma
  SVGs wins for design fidelity.

## Consequences

- Changing `ChatRoomHeader`'s `group` variant affects only its consumers (the channel room today). If
  another consumer turns up, it has to be verified too.
- web-ui-kit gains the default group avatar and the extracted Figma icons, so other screens can reuse
  them.
- The floating date pill adds scroll-event observation, so the scroll logic gets slightly more
  complex.
- Keeping the empty-state gating leaves a condition that does not match Figma exactly (a member
  without permission sees an empty screen). That is the intended trade-off.
- Next step: this ADR feeds the spec phase (Phase A) of `dev-2_implement`. Before implementing, extract
  the exact colour and spacing tokens and the icon SVGs from Figma.
