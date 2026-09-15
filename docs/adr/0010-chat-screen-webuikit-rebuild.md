# Rebuild the chat screen on web-ui-kit — per-case headers, two read-status modes

## Status

accepted · decided 2026-07-15

## Context

A DoU design (Figma) update reworked the chat room screen, and the code has to follow it. The core
requirement is that **the header and the read status differ by chat type**: self chat, a group of
one, a group of two, a group of n.

Constraints in the current implementation
(`apps/web/src/app/features/channels/pages/ChannelRoomPage.tsx`):

- Header, message list, bubbles and the composer are inlined in one file — a **monolith**.
- The header logic is **binary**. `isSelfChat` gives a fixed "Self Chat" label; everything else gets
  `channel name + memberCount`. There is no 1 / 2 / n split, and **the header carries no avatars**.
- The read status (`components/ReadStatus.tsx`) is the old one — it shows an unread count in yellow
  and nothing else.
- Past 200 characters, "see all" opens an in-page state overlay (`setExpandedMessage`) rather than a
  route.

The design system (`libs/web-ui-kit`, `@chatic/web-ui-kit`) gained chat components in recent commits,
but not enough to express these cases:

- `ChatRoomHeader` has two kinds only, `kind='direct' | 'group'` — **no member count, and the library
  has no overlapping-avatar component (AvatarGroup/Stack) at all**.
- `MessageRow`, `MessageBubble`, `DateDivider`, `SystemMessage` and `MessageInput` exist but are not
  used by the screen yet.

What nine Figma nodes settled:

- **Header.** Self chat shows the title only. A group shows an **overlapping avatar stack plus the
  total member count** under the title — two avatars and "2", or four avatars and "22" for a crowded
  room.
- **Two read-status modes** (spec node 1922-37684): 1:1 uses the words read / unread, a crowd uses
  counts, `read N · unread M`. Screenshots confirm a room of 2 renders as text and a room of 22
  renders as counts, so **the header number counts me in**.
- **See all** is a screen with its own header, "See whole message" (1922-37666).
- **Composer states** (spec node 1922-37774): empty, focused, typing, max height, max height
  scrolling.
- Figma has only the 2-member and 22-member group screens. **There is no "group of one" screen**, so
  that was the one case with no spec — settled below.

## Decision

### 1. Rebuild the chat screen

Replace every piece of inline markup in `ChannelRoomPage` — header, message list, bubbles, read
status, composer, see-all — **with `@chatic/web-ui-kit` components**. `ChannelRoomPage` keeps data
fetching, derivation and container logic; presentation moves to the library.

### 2. Extend web-ui-kit with the missing components

- **Add `AvatarGroup`.** A presentational component that overlaps up to four member avatars and shows
  the total count beside them. It follows the library convention: stateless, slot-based (README).
- **Extend `ChatRoomHeader`** with a subtitle slot that holds `AvatarGroup + count`, so the header can
  express the self / group split.
- **Redefine the read-status component with two modes** — the read / unread text mode, and the
  `read N · unread M` count mode. It replaces today's unread-count-only display.

### 3. Two top-level kinds: `self` and `group`

A chat room has **two top-level kinds only**, `self` and `group`. web-ui-kit's
`ChatRoomHeader` `kind='direct'` (a 1:1 DM) is **out of scope here because the design is not settled**.
`self` is `stereo === 'self'`; everything else is a `group`. The header count **includes me**.

| Kind             | Condition           | Header                                                  | Read status        |
| ---------------- | ------------------- | ------------------------------------------------------- | ------------------ |
| Self chat (self) | `stereo === 'self'` | Title only ("Self Chat"), no avatars or count, menu on   | None               |
| `group`          | everything else     | Title + avatar stack + total count                       | By member count    |

The member-count sub-cases of `group`:

| Group size (total) | Header                                     | Read status               |
| ------------------ | ------------------------------------------ | ------------------------- |
| 1 (just me)        | Title + count "1", no avatar stack         | None                      |
| 2                  | Title + 2 avatars + "2"                    | read / unread as words    |
| n (3+)             | Title + up to 4 avatars + "N"              | `read N · unread M` counts |

- **"Group of one" means a group where everyone else left or nobody has joined yet** — a total of
  one. Count "1", and no read status, because there is nobody to read.

### 4. Read-status rules

- The mode follows **member count**: two members render words, three or more render counts. Self chat
  and a group of one render nothing.
- The count is computed **per message** — each member's `join.readNo` cursor against the message's
  `chatNo`. This is what the data layer already does.
- Read status shows **in every chat** (self chat and a group of one are not display cases). Cloud type
  does not decide whether it appears.

### 5. See all

See all **keeps the in-page overlay** and only takes the Figma styling ("See whole message"). It does
not become its own route.

## Considered Options

- **Hardcode the cases into `ChatRoomHeader` vs. split `AvatarGroup` out** — split. An overlapping
  avatar stack is worth reusing, and keeping the header thin and slot-based is the library convention.
- **Move see all to its own route vs. keep the overlay** — keep the overlay. Figma draws it full
  screen, but the overlay already behaves well and a new route widens the change. Only the styling
  changes.
- **Touch only the header and the read status vs. rebuild the screen** — rebuild. The design moved
  across the whole screen (bubbles, composer, date dividers, system messages), web-ui-kit already has
  the matching components, and clearing out the inline markup is better done in the same pass.

## Consequences

- web-ui-kit gets more reuse and `ChannelRoomPage` slims down to a container. `AvatarGroup`,
  `ChatRoomHeader` and the read-status component are new or changed, so each needs a story and a test
  (`*.stories.tsx`, `*.test.tsx`) per library convention.
- The "group of one" case has no Figma screen, so this ADR fixed its spec: count "1", no read status.
  Revisit this decision when a design arrives.
- The `direct` (1:1 DM) header is out of scope. Every non-`self` channel is treated as a `group`, so
  introducing `direct` later means defining both the detection rule and the header branch — and
  updating this ADR.
- Read counts derive from per-message `join.readNo`, so while cursors are still syncing the count can
  read low. That is the data layer's existing limit, inherited as is.

## Next steps

This ADR feeds the spec phase (Phase A) of `dev-2_implement`. The spec settles the implementation
detail: how many avatars `AvatarGroup` shows and its overflow rule, which members it picks, the
`ChatRoomHeader` subtitle slot API, the read-status component props, and the composer's per-state
style tokens — pulling the Figma nodes it needs through `get_design_context`.
