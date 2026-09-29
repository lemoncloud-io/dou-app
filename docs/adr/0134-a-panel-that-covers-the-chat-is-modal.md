# ADR-0134: Below 1280px a trailing panel that covers the chat is modal over it

> Status: Accepted · Decided: 2026-09-29 · Implemented: PR #508 (`fix/desktop-chat-critique`)
> · Scope: `apps/desktop-web/src/app/shared/components/ResizablePanel.tsx` ·
> `apps/desktop-web/src/app/features/chat/components/DesktopLayout.tsx`
> · The module doc is [trailing-panels.md](../../apps/desktop-web/docs/shell/trailing-panels.md)

## Context

The thread, Mentions, Saved, settings and profile panels dock beside the chat from 1280px up. Below
that they are laid over the chat's right side, and the chat stayed fully live under them. At 1024px
about 218px of feed was left showing. All of the chat stayed in the tab order and clickable,
including the controls hidden under the panel. The panel did not take focus when it opened, so a
keyboard user stayed in the feed behind it. The panels also opened at three different widths.

## Decision

1. **While a panel covers the chat, the chat is inert and dimmed by a scrim.** A click on the scrim
   closes the panel.
2. **The covering panel takes focus**, unless its own content already did (the thread's reply box).
3. **Closing returns focus to what opened the panel.** The opener is read on the panel's first render,
   before any effect can move focus.
4. **All panels open at one width, `PANEL_WIDTH` (360px).** Each kind still remembers its own drag.

## Alternatives

- **Narrow the sidebar first, and overlay only when that is not enough.** The sidebar is where the
  reader switches rooms. Shrinking it under a panel trades one covered surface for a cramped one, and
  the overlay case still needs the modal treatment when the window is narrower still.
- **Leave the chat live and only add a shadow.** That is what existed. It left keyboard and
  screen-reader users working in a pane they could not see.

## Consequences

- Below 1280px, reading the feed and reading a panel are no longer simultaneous. The reader closes
  the panel to get back to the chat, which is what a click on the covered chat now does.
- A panel with no `onClose` would leave an inert, unclickable scrim. Every panel now passes one;
  DebugPanel did not, and does since this change.
