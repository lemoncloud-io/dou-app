# ADR-0340: Back and Forward step through the rooms the reader moved between

> Status: Accepted · Decided: 2026-11-18 · Implemented: `feat/desktop-channel-history`
> · Supersedes decision 3 of [ADR-0130](./0130-a-jump-returns-the-reader-to-where-they-were-reading.md)
> · Scope: `apps/desktop-web/src/app/features/chat/hooks/useChannelHistory.ts` ·
> `apps/desktop-web/src/app/features/chat/utils/channelHistory.ts` ·
> `apps/desktop-web/src/app/features/chat/hooks/useHistoryNavigation.ts` ·
> `apps/desktop-web/src/app/features/chat/pages/HomePage.tsx` · `apps/desktop/src/main/index.ts`
> · The module doc is [jump-and-return.md](../../apps/desktop-web/docs/chat/jump-and-return.md)

## Context

ADR-0130 gave a jump one way back: a "Back to …" bar, one level deep, with no history stack, because
the critique behind it found no task needing more than one step. Desktop then bound the usual Back
inputs (Mod+[, the mouse's back button, a trackpad swipe, a Go → Back menu item) to that same return
point.

Readers expect Back to return to the screen they were on and the message they were reading, after
any move and not only after a jump: the app is a webview, and a page-like view is what they treat it
as. A reader who pressed Mod+[ after moving between rooms from the sidebar got nothing, because only a
jump recorded where to go back to. On a desktop messenger, Mod+[ and Mod+] stepping through the rooms
visited is the convention people bring with them.

## Decision

1. **Back and Forward step through every room the reader moved between on home**, not only jumps. An
   entry is the whole reading position ADR-0130 defined (cloud, place, channel, first message in view,
   open thread), so a step lands where the reader was reading.
2. **The history watches the open room instead of every door into one.** When the selection changes,
   the room left is recorded. A step's own landing is not a move, and neither are the rooms an open
   passes through while a place or cloud switch lands it.
3. **Forward exists**, cleared by any new move: Mod+], the mouse's forward button, the opposite swipe
   and Go → Forward.
4. **A thread is part of a position, not a step.** Opening a thread does not add an entry; stepping to
   a room reopens the thread that was open there.
5. **The history lives in memory, not in the URL.** The chat view's state stays in its stores; the URL
   does not change as rooms do. A reload starts the history empty.
6. **The jump bar stays, as Back made visible.** A cross-room jump changes the selection, so the room
   it left is the last entry; the bar takes that step. While the bar shows, Back does what it says,
   so a jump inside one room still restores in place.

## Alternatives

- **Write the view state into the URL (a hash or a path) and use the browser's history.** It would
  survive a reload and give every room an address. It would also make the URL a second source of
  truth for state the stores own today (the selected channel, the open thread, the active cloud and
  place), with a sync in both directions and a page-level history mixed into room steps. A reload
  already reopens the last room from the stores, so the one thing gained is Back after a reload.
- **Keep one level and only bind more inputs.** That is what shipped first. It leaves Mod+[ doing
  nothing after a sidebar move, which is the case the request was about.
- **Record at each entry point (sidebar, switcher, rails, jumps).** Every new way of opening a room
  would have to remember to record, and a missed one silently drops a step.

## Consequences

- A cloud or place switch that lands on a room records the room it started from once. Should an
  intermediate room stay selected long enough for the next render without a pending open, it is
  recorded as a step of its own.
- An entry for a room in another place or cloud is offered without checking that the room still
  exists, as ADR-0130's origin was. A step to a removed room lands in the place without it, and the
  reader's next move records as usual.
- A self room that every place lists under one id is told apart by place: moving between places on it
  is a move.
- Fifty entries are kept each way.
