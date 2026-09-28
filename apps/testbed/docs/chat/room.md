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

## Image send

The composer's `사진` button picks images and sends them as one message through the same
`sendImageMessage` the app runs (`@chatic/data`, [docs/uploads](../../../../libs/data/docs/uploads/README.md)).
Its ports are bound here: the real `prepareImage(file, CHAT_ATTACHMENT)`, the chat repository's
`startUploads` / `completeUploads` / `sendPendingImageChat`, and a page XHR PUT
(`features/image-send/xhrPut.ts`, the browser shape of `apps/web`'s own). A pending row is written
first and failed if the sequence fails. There is no retry button. Send again instead.

The point is measurement, so the header's `업로드 로그` button opens a log of every step: the prepared
type, size and dimensions, each slot's `upload.start` answer, each PUT's status, `upload.complete`'s
statuses, and what `chat.send` answered. PUT lines carry the label and the status only. The ticket's
URL and headers are never written anywhere.

Measured on dev, 2026-09-28, in a desktop browser:

- Three images (two JPEG, one PNG): one `start` with a thumbnail ticket per slot, six PUTs answered
  200 from the page's origin (S3 CORS passes), all three `stored`. `chat.send` with `content: ''` is
  accepted.
- A `text/plain` file next to a JPEG: `start` rejects that slot as
  `{ status: 'failed', error: '415 UNSUPPORTED - …' }` with no id and no ticket, and the message goes
  out with the one stored image.
- **`chat.send`'s own answer carries no image URL**: its `upload$$` is `{ id, status, stereo }`.
  `chat.feed` answers `orgUrl` and `thumbUrl` (signed, short-lived). The tiles therefore show "no url
  yet" until the room reads the feed again.

## Related

- [README.md](./README.md) — the channel list this screen is entered from
