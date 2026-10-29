# ADR-0252: Desktop gathers the threads I take part in on a Threads page

> Status: Accepted · Decided: 2026-10-29 · Implemented: `feat/desktop-threads-view`
> · Scope: `apps/desktop-web/src/app/features/chat/`
> · Partly supersedes: [ADR-0219](./0219-desktop-nav-rail-and-device-local-inbox.md) — only decision 5's
> removal of the My-threads screen and sidebar row. The inbox's Threads tab it created stays.

## Context

ADR-0219 folded the My-threads list into the Notifications inbox: a reply someone else writes in a
thread of mine becomes an inbox item, and opening the item opens the thread panel. That answers "what
is new", one reply at a time. It does not answer "what is going on in my threads": to read a thread
the user clicks into it, and to read the next one they click again. Users comparing it with Slack's
Threads view asked for the threads gathered in one place, read without opening each.

## Decision

1. **The Home sidebar gets a Threads row above Saved.** It opens a Threads page in the main pane, the
   same slot the Saved page uses (`useSavedPageStore` carries which page is open). A dot on the row
   says a listed thread has replies I have not seen.
2. **The page is a column of cards, one per thread in `useMyThreadsStore`** for the current cloud and
   place, unread first, then by latest activity. The order is the one the page opened with, so a card
   does not jump while it is read.
3. **A card shows the root and the newest three replies**, read from the chat cache of the thread's
   own cloud and drawn by the thread panel's message row, with a link to the thread panel for anything
   earlier. A card showing its thread on screen for a second marks it seen.
4. **A card has a text-only reply box**, mounted when asked for. Files and @ suggestions stay in the
   thread panel.
5. **The inbox's Threads tab stays.** The page is for reading threads; the tab is for being told.

## Alternatives

- **A nav rail destination.** Rejected: the rail holds the app's top-level places, and threads are
  read per place, like Saved.
- **Text previews on a card.** Tried first and dropped: a photo read as "Photo", and an author showed
  by account name with no avatar while the thread panel showed their place nickname and picture. Cards
  draw their messages with the panel's own `MessageRow`, so the two cannot disagree.

## Consequences

- The list stays device-local, with the limits `my-threads.md` lists: a thread outside this device's
  cache or older than its 100 entries is not on the page.
- A card that cannot see the thread's start says "earlier replies" without a count.
