# ADR-0288: Desktop marks new thread replies on the root, for the visit

> Status: Accepted · Decided: 2026-11-05
> Scope: `apps/desktop-web/src/app/features/chat/utils/buildThread.ts` (`buildThreadIndex`,
> `NewReplyRule`) · `apps/desktop-web/src/app/features/chat/hooks/useNewReplyRule.ts` ·
> `apps/desktop-web/src/app/features/chat/components/MessageList.tsx` (first-fill landing) ·
> `apps/desktop-web/src/app/features/chat/components/MessageRow.tsx` (thread footer)

## Context

A thread reply takes a number in its channel's message sequence, so it raises the channel's unread
count and the sidebar dot like any other message. The main feed does not draw replies; they belong to
the thread panel. Opening a channel whose only news was a reply therefore cleared the dot over a feed
with nothing new in it. There was no "new messages" divider either, because the divider sits above a
message the feed draws. The dot led nowhere.

The server keeps no read position per thread.
[ADR-0242](./0242-a-thread-reply-can-stand-as-a-rooms-home-preview.md) left a per-thread unread count
for when one exists. That is still the case, so whatever the desktop shows has to come from what the
client already holds.

## Decision

1. **The root's footer says how many replies are new.** "N new replies" with an unread dot takes the
   place of the last-reply time. A reply is new when it is above the read cursor the channel opened
   with (the cursor the unread divider uses), is not mine, and is not deleted. With no cursor known,
   nothing is marked, the same rule that stops the divider from flashing on a fresh channel.
2. **Opening the thread clears its mark.** While the panel shows a thread, everything loaded up to the
   channel's newest message counts as seen for that root. The record lasts for the visit and is
   dropped when the channel changes. The channel's own read cursor moves on open, as before.
3. **The feed lands where the news is.** On the first fill, a request to open at the bottom wins, then
   the unread divider, then the oldest root with new replies, and otherwise the bottom.
4. **The panel is not opened for the reader.**

## Alternatives

- **Open the thread panel on entry.** It goes straight to the reply. But the news may sit in more than
  one thread, or in the feed as well, and the panel takes width from the feed. A channel opened to
  read the channel would be rearranged on every visit. Rejected.
- **Leave replies out of the channel's unread count.** The client cannot net them out: the count is
  the head minus the cursor, and nothing says how many replies lie between them. It needs a server
  counter like the one for system messages.
- **A read position per thread on the server.** This would make the mark survive a channel switch,
  another device and a reload, and give the Threads page an exact count. It is a server change and is
  left for when one is made. The client rule in (1) is the piece it would replace.
- **Keep landing at the bottom.** This is the behaviour that left the dot pointing at nothing.

## Consequences

- The mark is per visit. Leaving the channel and coming back measures from the new cursor, which the
  first visit already moved past those replies, so the mark is gone even if the thread was never
  opened.
- Only replies in the loaded window are counted. A new reply to a root above the window is not marked
  and does not move the landing until that root loads.
- The rule is desktop only. Mobile has its own feed and is unchanged.
