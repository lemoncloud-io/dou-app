# ADR-0132: The desktop feed is one tab stop, and a message's controls are reached through it

> Status: Accepted · Decided: 2026-09-29 · Implemented: PR #508 (`fix/desktop-chat-critique`)
> · Scope: `apps/desktop-web/src/app/shared/hooks/useRovingFocus.ts` ·
> `apps/desktop-web/src/app/features/chat/components/MessageList.tsx` ·
> `apps/desktop-web/src/app/features/chat/components/MessageRow.tsx`
> · The module doc is [keyboard.md](../../apps/desktop-web/docs/chat/keyboard.md)

## Context

Every message in the desktop feed was a tab stop, and so was every button in every message: the avatar,
the author name, reaction chips, the thread link, image tiles. The message toolbar was already
`inert` until its message was hovered or focused, but that only removed the toolbar. At 1024px the
composer was tab stop 161 of 163, and a keyboard user reached it by walking the whole visible history.

## Decision

1. **The feed keeps one message in the tab order** (roving tabindex): the newest, until the reader
   focuses one, then that one.
2. **↑/↓ move between messages, Home/End go to either end, and Enter moves into the message's
   toolbar.**
3. **Only the current message's controls, and its author block's name, are tabbable.** Every other
   control in the feed is parked at `tabIndex=-1` and restored when its message becomes current. So Tab
   from the current message walks its own controls and then leaves the feed.
4. **The tab order is written on the DOM, not through React props.** Moving the stop then re-renders
   no row. Rows are memoised, and re-rendering the two affected groups on every arrow press would put
   render work on a key-repeat path.
5. **The avatar button leaves the tab order.** The author name opens the same profile card.

## Alternatives

- **A `role="grid"` with cell navigation.** It is closer to the ARIA pattern for two-dimensional
  widgets, but a message is not a row of cells, and screen readers announce grids as tables.
- **`aria-activedescendant` on the feed container.** Focus would never move into a message, so its
  controls could not take focus at all.
- **Only take the rows out of the tab order.** Tried first in this PR. Review found every button
  inside the messages still in the order.

## Consequences

- Tab stops at 1024px, measured live: 44 for the whole page, 2 inside the feed.
- Code that renders a focusable element into a message is parked automatically. It has to live inside
  a `data-roving-group` for that; a control outside any group (the feed's own jump buttons) is left
  alone.
- The hook runs a `querySelectorAll` over the feed's controls after each feed render. That is linear
  in the controls on screen. It has not been profiled.
