# ADR-0251: Desktop shows no per-message read receipt

> Status: Accepted · Decided: 2026-10-29 · Implemented: `feat/desktop-drop-read-receipts`
> · Scope: `apps/desktop-web/src/app/features/chat/`
> · Amends: [ADR-0239](./0239-korean-screen-copy-follows-the-product-glossary.md) — only its note that
> desktop's receipt reads `미확인` / `모두 읽음`. The rest of that ADR stands.

## Context

The desktop feed drew a receipt line under a message block: `Seen by 9 • Unseen by 1` (ko
`읽음 9 • 미확인 1`), or `Seen by all` once nobody was behind. A line under every one of my blocks was
the loudest repeated element in a busy channel, so only my latest block showed it outright. Every
earlier block showed its receipt only while that message was hovered or had keyboard focus.

That compromise is the problem. Moving the pointer down the feed made a line of text appear and
disappear under each message it passed, and the row grew and shrank with it. The receipt read as a
flicker tied to the cursor rather than as information about the message. Showing it under every
block brings back the noise the hover rule was there to remove, and keeping it only on the latest
block makes older messages look as if they had no read state at all.

## Decision

**Desktop draws no read receipt under messages, in the channel feed or in the thread panel.** The
counting that fed it goes too: the per-channel roster-wide read-state subscription, the
`Seen by` / `Unseen by` copy, and the module doc that described the line.

What stays is the reporting of my own read position. The client still advances my read cursor while
I am in a channel, because the unread badges, the sidebar counts and other members' clients depend on
it.

## Consequences

- **Desktop and mobile differ.** The phone keeps its receipts (`apps/web`, `libs/web-ui-kit`). Someone
  who uses both sees read counts on one and not the other. This is accepted: the phone's bubble layout
  has a fixed place for the count beside the time, while desktop's channel layout has none that stays
  still.
- **Who has read a message can no longer be checked on desktop.** If that is needed again, it should
  come back as something the reader asks for, such as a menu item or a hover card, not as a line that
  appears in the feed itself.
- **The read-state sync for other members' join rows is gone from desktop.** Nothing else on desktop
  read other members' cursors, so this lowers the work done per open channel.
