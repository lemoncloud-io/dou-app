# ADR-0130: A jump returns the reader to where they were reading, not to the channel

> Status: Accepted · Decided: 2026-09-29 · Implemented: PR #508 (`fix/desktop-chat-critique`)
> · Scope: `apps/desktop-web/src/app/shared/stores/useMessageJumpStore.ts` ·
> `apps/desktop-web/src/app/features/chat/utils/jumpReturn.ts` ·
> `apps/desktop-web/src/app/features/chat/pages/HomePage.tsx` ·
> `apps/desktop-web/src/app/features/chat/components/MessageList.tsx`
> · The module doc is [jump-and-return.md](../../apps/desktop-web/docs/chat/jump-and-return.md)

## Context

Desktop can jump to a single message from search, Saved, Mentions and a notification. A jump is
usually a detour ("check the evidence, then come back"). The return half did not work:

- "Back to #x" reopened the origin channel at its latest message, with the thread closed. The reader
  had been somewhere in the middle, often in a thread.
- A jump inside the open channel recorded no return at all.
- After a jump into another place, the bar never appeared, because it looked for the origin in the new
  place's channel list.
- The second jump in an open channel did nothing. Its nonce was counted from a target that had just
  been cleared, so it matched the jump the feed had already handled.

## Decision

1. **The return point is a reading position, not a channel.** It holds the cloud, the place, the
   channel, the first message that was in view, the open thread, and a label captured at record time.
   The feed reports the first visible message as it scrolls.
2. **Every jump records it before it moves the reader**, same-channel jumps included. Moves that are
   destinations rather than detours retire it: a rail click, a channel-list pick, a Quick Switcher
   pick.
3. **One level deep.** A second jump replaces the first return point, as a single Back button would.
   There is no history stack.
4. **A return is a `restore`, which is not a jump.** The anchor goes back to the top of the view with
   no flash. A missing anchor, or "the latest", lands at the bottom with no "not found" toast and no
   paging back through history. The thread reopens.
5. **Nonces count every request in the session**, so a repeat jump always fires.

## Alternatives

- **A history stack (Back, Back, Back).** More to explain, and the critique found no task that needed
  more than one step back. One level matches the one "Back to …" bar the feed already had.
- **Restore by scroll offset instead of by message.** An offset breaks as soon as a page loads above
  it or a row changes height. A message number survives both.
- **Record only the channel and scroll to the unread divider on return.** That is where a channel
  opens, not where this reader was.

## Consequences

- An origin in another cloud or place is offered without checking that its channel still exists.
  Going back to a removed channel lands in the place without it.
- The position is written on every scroll frame. The store drops unchanged values, so it only notifies
  when the first visible message changes.
- A page that arrives just after a landing no longer tails the reader to the latest: the feed sets its
  "at the bottom" state from real scroll metrics after a jump.
