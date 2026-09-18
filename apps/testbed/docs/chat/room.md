# room

The message list and composer for one selected channel — the screen this app exists to exercise:
pagination, ordering and send against the real cache/socket stack. Screen code:
`apps/testbed/src/app/pages/ChatRoomPage.tsx`, route `/chat/channels/:channelId`.

## Scroll and paging

Standard chat ordering — oldest at the top, newest at the bottom — and the screen opens scrolled to
the bottom. Reaching the top loads older messages, and the scroll position is anchored across that
load rather than jumping: `pagingAnchorRef` records `scrollHeight` right before the older page is
fetched, and once it lands the code restores position as `scrollHeight - anchor` so the message the
user was looking at stays under their eye instead of the view resetting. A failed page fetch drops
the anchor rather than leaving it pointing at a height that never grew.

New messages append at the bottom; whether the view auto-follows them depends on whether the reader
was already within a small distance of the bottom before they arrived — being scrolled up to read
history isn't interrupted by an incoming message.

## Data scope

The message list is strictly scoped to the currently selected channel. Switching channels discards
whatever the previous channel's messages held rather than reconciling — there is no cross-channel
merge state to get wrong.

## Failure handling

A missing or inaccessible channel shows an error state with a way back to chat home, kept separate
from a send failure — a fetch problem and a send problem are different failures and read as such
here. Paging stops once the server reports no more older messages, rather than retrying.

## Related

- [README.md](./README.md) — the channel list this screen is entered from
