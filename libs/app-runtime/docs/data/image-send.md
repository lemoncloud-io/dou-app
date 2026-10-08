# image send — `useSendImages`

> Canonical code: [`hooks/useSendImages.ts`](../../src/data/hooks/useSendImages.ts). The sequence it
> runs is `@chatic/data`'s, documented in
> [libs/data docs/uploads](../../../data/docs/uploads/README.md). Consumers: `apps/desktop-web`'s room and
> thread composers (`useComposerSend`, which binds `xhrPut`), and `apps/web`'s shell binding
> ([image-send.md](../../../../apps/web/docs/feature/channels/image-send.md)).

`data.useSendImages({ cid, channelId, parentId?, put, putShellFile?, prepareVideo?, onVideoRefused?, beforeSweep?, waitForConnection? })`
sends picked attachments — page files, and in the mobile app shell files too — as one message, or
as one message per file (§ One message, or one per file), with text in it when asked (§ Text with
the pictures), and returns
`{ sendImages, retry, canRetry, discard }`. It holds no rules about uploads itself. It binds the data
layer's `sendImageMessage` to the room's cloud and to the PUT the shell passes in, and it keeps the
picked files for as long as a retry could still need them.

What differs between shells enters as two ports, so every shell runs the same orchestration:

| Port                | Browser and desktop          | Mobile app (`apps/web` inside the native shell)                     |
| ------------------- | ---------------------------- | ------------------------------------------------------------------- |
| `put`               | `xhrPut` from `@chatic/data` | the native transfer module, falling back to `xhrPut` in old builds  |
| `beforeSweep`       | none                         | catch up with transfers the app finished while the page was away    |
| `putShellFile`      | none                         | the transfer module, sending a file the shell keeps from its folder |
| `prepareVideo`      | none                         | `PrepareVideo`: the shell converts a video and makes its poster     |
| `waitForConnection` | none                         | `data.waitForCloudSocket`: wait up to 10 s for the cloud's socket   |

`waitForConnection` runs inside the cloud's hold, before the sequence's first request. A send can
start the moment the page comes back to the front — an OS picker answers as the person returns, and
the page's socket closed while it sat behind the picker for more than a few seconds. The socket comes
back within about a second, but a request sent in that second fails at once. The port resolves `true`
once the slot is signed in again or `false` after ten seconds, never rejects; either way the sequence
then runs, so a socket that stays down fails the send as before, retryably. `waitForCloudSocket`
answers at once when the socket is already up. Desktop passes none and starts at once.

`sendImages` resolves once the send has settled, sent or failed — every message of it, when it sends
one per file. A caller that has to follow the pictures with another message awaits it. Desktop sends
the composer's text first, at the press, and the pictures after it, so it awaits nothing. The mobile
app's attach panel puts the text in the photo message instead (`content`).

**Everything is addressed to `cid`, the room's own cloud** — the channel row's `cid`, never the
selection. Each pending entry remembers it, every repository call goes through
`getCloudRepositories(cid)`, and the upload and the send run inside
`runInCloud(cid, …)`, which holds that cloud's socket until the send settles. An upload
takes seconds, and a cloud switch in that time used to put the finished message on the next cloud's
socket while its row stayed in the first; now the row, the upload and the send stay together
whichever cloud is on screen by the time it ends.

## What happens on send

1. **A pending row goes into the cache first** (`chat.createPendingImageChat`), with an object-URL
   preview per file and the message's text when it has one, so the message is on screen before
   anything is prepared or uploaded. The list is cut to ten first, so the row never shows a slot
   that will not be sent. A video or document also passes its name, type and size (`localFiles`),
   which its slot keeps for the card drawn in place of a preview. A send of images only passes none
   and writes the row it always has.
2. **The sequence runs** on ports the hook binds: `prepare` is `prepareChatAttachment(file)` for an
   image. A video or document (`chatAttachmentFormat` in `@chatic/data`) is not redrawn: it goes up
   as its original with no dimensions, under the server's content type and a name that ends in its
   format's extension. A document has no thumbnail. A page video gets the poster the browser draws
   (`makeVideoPoster` in `@chatic/shared`: 0.5 s in, 400 px on the long side, at most 200,000 bytes —
   the shells' own rule, so the server keeps it) as its thumbnail. It goes without one when the
   browser cannot draw it (HEVC in most Chromium builds, no frame within ten seconds); a poster never
   holds a send back. This is what gives a video sent from the desktop or a phone's browser a frame on
   the mobile feed, whose tiles draw thumbnails only. The other ports:
   `start` / `complete` / `send` are the chat repository's `startUploads` / `completeUploads` /
   `sendPendingImageChat(pendingId, …)`, and `put` is the sender the shell passed in.
3. **Sent** — the repository has already swapped in the server's row and read it back once for the
   image addresses, which the send's own answer does not carry. The hook lets the files go and
   revokes the previews.
4. **Failed** — the row is marked failed (`chat.failPendingImageChat`), and the files stay in memory
   so `retry(pendingId)` can send the same pictures again on the same row. `canRetry` turns true only
   once the failure is written, and a retry claims the row before its first await, so a double tap
   runs once. The map lives outside React, so every change to it bumps a version the hook subscribes
   to (`useSyncExternalStore`) and `canRetry` comes back as a new function: a memoised row that takes
   it re-renders when its Retry becomes available, even though the failure write re-rendered it a
   moment earlier. A retry of a row deleted meanwhile answers `false` and lets the files go.

The row starts from the original files' object URLs: the thumbnails do not exist yet when it is
written, and holding the row back until they do would leave the press with nothing on screen for as
long as the preparation takes. Once every image is prepared — before the upload starts — the row is
rewritten **once**, with a thumbnail preview for each image that has one (a GIF keeps its original)
and each video poster. One cache write per message, not per image, and the feed stops decoding
full-size photos for small tiles. A retry keeps the thumbnails it already has.

## One message, or one per file

`sendImages(files)` sends the pick as one message. `sendImages(files, { separately: true })` sends one
message per file instead, in pick order — what the app's photo grid does when the sender turns
"send as one message" off. Both cut the pick to ten first, so a pick is at most ten messages. One file
is one message either way, and the option changes nothing about it: it neither queues in its room nor
takes the preparation turn (both below).

**Every row is written first, then the messages go one after another.**

1. All the rows go into the cache before anything is prepared, in pick order, so the whole pick is on
   screen at the press. Each write is awaited and the next one starts on a later millisecond: pending
   rows (`chatNo: 0`) sort by `createdAt`, in milliseconds, and two rows written within the same one
   would show in whatever order the cache lists them.
2. Then, once what the room had on its way before the pick has settled (below), each message runs the
   whole sequence — prepare, upload, send — and settles before the next one is prepared. The server
   numbers a message when its send arrives, so this is what puts the sent messages in pick order, and
   nothing sent in the room meanwhile lands between them. A row waiting for its turn is already in
   flight, so neither a retry nor the attach-time sweep can take it.

**Nothing else sent in the room lands between them.** A send made in the same room while a one-each
pick's messages go out — another pick, a camera photo — would otherwise reach the server between two
of them and be numbered there, for good and for everyone in the room. So every send takes its place in
its room — cloud, channel and thread — as it is called, before its first await, and the room keeps the
order the sends were made in (`takeRoomTurn`):

- **A one-each pick waits for what the room had before it.** Its first message starts only once every
  send made in the room before it has settled: an earlier one-each pick, with everything that pick
  waited for, and the bundled sends already on their way.
- **Whatever comes during it waits for it.** A send made in the room while a one-each pick runs —
  bundled or one each — starts only once that pick's last message has settled.
- **A bundled send waits for one-each picks only**, never for another bundled send. In a room with no
  one-each pick on its way it starts at once, as it always did, and two bundled sends can still land in
  either order. Desktop sends nothing but bundled messages, so its rooms send exactly as before.
- **Rows are written at once, waiting or not.** Only the uploads and the sends wait, so the press puts
  the row on screen as it always did. `sendImages` resolves once its own messages have settled, so a
  send that waited resolves that much later.
- **A room and its thread queue apart.** A reply takes its number from the room's sequence but never
  shows in the room's feed, so neither can land visibly between the other's messages.
- **A retry never waits** (below).

The wait has no ceiling of its own. It relies on every step of a run giving up by itself — the
ten-second connection wait, the bridge's and the socket's timeouts, the ten minutes `apps/web`'s
`prepareVideo` gives a conversion, a poster's ten seconds — so a run that hung would hold the room's
later sends with it, where it used to hold only its own message.

What that costs: no upload overlaps another message's, and each message makes its own socket requests
— `start`, `complete`, the send and its read-back, four per file where one message of ten makes four
in all — and its own `waitForConnection`, so with the socket down every message waits its own ten
seconds. A send made in the room while a one-each pick goes out waits for all of it: tens of seconds
behind ten photos, minutes when one of them is a video the app has to convert.

**A message that fails does not stop the next.** It is marked failed on its own row and the queue
moves on; each row then retries or is deleted on its own, with its own file. A retry goes when it is
tapped, off the room's queue: a message retried after later ones were sent lands after them, and one
retried while a pick is still going can land between that pick's messages. A file the server or the
shell refuses fails its own row, as in any one-file message, rather than splitting off a leftover row.

**A row that cannot be written ends the writing.** The rows written before it still go; the files
after it get no row, since nothing would send them. `sendImages` then rejects with the write's error,
once the written messages have settled — the caller's "could not send" notice, as for a one-message
send whose row could not be written.

**The screen leaving does not stop the queue.** Every row is already on screen as sending, and
stopping would strand the later ones there. Each queued message runs as a one-message send still
running would: it can still finish, and its files go as soon as it settles, a failed one left to
delete. Coming back to the screen before a message settles keeps its files, as for any running send.

**One preparation at a time, for one-each messages.** The sequence prepares its own files one by
one, because on the native shell a decode holds the whole source in WebView memory. A one-each pick is
what puts several messages on their way together, so its messages also take turns with every other
one-each message on the page (`prepareInTurn`), and so does every retry of one of their rows: a retry
tapped while the rest of its pick still goes, or a one-each pick in the thread while one runs in the
room, waits for the preparation under way instead of decoding beside it. A bundled message stays off
that turn, and so does a retry of a bundled row: it prepares as it did before one-each sends existed,
so two bundled messages still prepare side by side, and desktop, which sends nothing else, is
unchanged.

A turn is held for thirty seconds at most (`PREPARE_TURN_CEILING_MS`). Nothing is expected to take
that long — a page video's poster, the slowest, gives up after ten — so a preparation still running
then no longer holds the next one back. One that never settled would otherwise stall every later
one-each send on the page until a reload; it still holds its own message.

## Text with the pictures

`sendImages(files, { content })` sends text in the photo message itself: one message carrying the
text and the pictures, which the mobile feed and desktop already draw. It is the mobile app's
caption — the composer's text, when the composer's send button sends what was picked in the attach
panel. Desktop sends its text as a message of its own and passes none.

- **Bundled, the one message carries it. One each, the first message only**, so the text is said
  once, with the first picture, and the others go as pictures alone. A single file is one message
  either way and carries it.
- **It lives on the row, not in the page's memory.** The hook writes it onto the pending row
  (`createPendingImageChat({ …, content })`), and `sendPendingImageChat` sends whatever the row
  holds ([the uploads doc](../../../data/docs/uploads/README.md#pending-image-rows)). So the pending
  message shows its text while the files go up, and a retry, which re-arms the row with its previews
  only, sends the same text again.
- **Files split off a sent message carry none.** Files the server or the shell left out of a sent
  message are written as a failed row of their own (§ What happens on send, § Shell files); the text
  went out with the message they were left out of, so retrying that row sends the files alone.
- **Trimmed, and blank is none.** Text that trims to nothing writes exactly the row a send without
  it writes, so a caller that never passes it — desktop — sends as before.
- **A retried first message keeps its text.** A one-each pick whose first message fails and is
  retried later lands after the pictures sent meanwhile, as any retried message does (above), and
  its text lands with it.

## Shell files and video conversion

A shell file (`ShellFileRef`, see [the uploads doc](../../../data/docs/uploads/README.md)) is sent from
the shell's own folder through `putShellFile`. A shell file that reaches a shell with no
`putShellFile` fails its slot; it is never handed to `put`, which could not read it. A shell document
is sent under the name and type `chatAttachmentFormat` gives it, so an HWP the OS typed
`application/octet-stream` goes up as `application/x-hwp`.

**A shell video is converted before the sequence starts, not inside its `prepare` port.** After the
pending row is written, the hook calls `prepareVideo` for each shell video, one at a time in pick
order, outside the cloud's socket hold (a conversion can take minutes and needs no socket). A shell
file is a video by its format (`chatAttachmentSourceFormat`), not by the `kind` the shell gave it, so
an `.mp4` picked through the documents picker is converted or checked, and gets a poster, like one
picked from the album. The sequence fails the whole message when its `prepare` throws, and a refused
video must fail alone, so:

- **A refusal fails only that video.** `TOO_LARGE`, `UNSUPPORTED`, `SOURCE`, `SYSTEM` or a timeout
  leaves the video out of the list the sequence runs on, and it is reported the way a slot whose upload
  failed is: written as a failed message of its own. `onVideoRefused` is told `too-large` or
  `unsupported`, so the screen can say why. Whether that message can be retried depends on the
  refusal (below).
- **The result is judged again** with `judgeChatAttachments`, since the shell only estimated its size
  before converting. A result over the limit is refused like a `TOO_LARGE`.
- **Inside the sequence, `prepare` passes the converted file and its poster through** as the slot's
  original and thumbnail, both shell files.
- **The poster becomes the row's preview.** The shell hands a base64 copy of it, which `prepareVideo`
  returns as a `Blob`; the one preview rewrite (below) points the video's slot at it. A page video's
  poster is switched in the same way. Until then a video's slot has no preview: an object URL of an
  `mp4` drawn as an image only breaks. A shell video never gets a browser poster — the page cannot read
  a shell file, and `PrepareVideo` made one already.

**A shell file a retry could only fail again cannot be retried.** The file is marked gone for the page
(`goneShellFiles`) when the shell has lost it — `prepareVideo` answers `SOURCE`, or the shell's PUT
does, at its start (iOS refuses a missing file there) or once it reads — and when a video was refused
for what it is: `TOO_LARGE`, `UNSUPPORTED`, or a converted result over the limit, which converting
again would only repeat. Left out of a sent message, gone files are written as a failed row of their
own with no files in memory, so delete is all it offers; a failed message whose every file is gone
lets its files go the same way. Only a failure in passing stays retryable — `SYSTEM` (on iOS, the app
leaving the screen mid-conversion) or a timeout.

## Memory, and what it cannot hold

The picked files live in a map keyed by pending row id, **one per page**, not per screen. A room
and its thread can be open at once, and each drops only its own entries.

| When                                       | The entry                                                                                                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the message is sent                        | dropped, previews revoked                                                                                                                                         |
| `discard(pendingId)`                       | dropped, previews revoked. The row itself goes through each app's failed-message delete (web `useChatMutations.deleteMessage`, desktop `useComposerSend.discard`) |
| the screen leaves the channel, or unmounts | dropped. A send still running keeps its files until it settles, then drops them — unless the screen came back meanwhile                                           |

A `File` cannot be stored, so a reload loses the map. The pending row does not go with it: the web
cache never evicts unsent rows, and the native cache keeps whole rows. Left alone, such a row would
show "sending" forever, because nothing is left that could finish it.

**So attaching to a channel sweeps.** Once per attach, the hook reads the channel's pending image
rows (`chat.listPendingImageChats`) and marks failed every one that is still sending, older than
this screen, and has no entry in the map. `canRetry` is false for those, so delete is the only way
out. A row written after the screen attached is skipped, because it may simply not have reached the
map yet. Text optimistic rows are not touched. They have the same fate after a reload, but that
predates this hook.

A screen with no room yet (an empty `cid` or `channelId`) still lets the shell catch up, and then
does not sweep.

The sweep waits for `beforeSweep` first: a shell that finishes transfers while the page is away
catches up there, so a row it finished is settled rather than failed as a leftover.

## Not done here

- **Rendering.** The pending slots are `{ localStatus, localThumbUrl }`, plus `localName`,
  `localContentType` and `localSize` for a video or document. The tile that draws them,
  the retry and delete buttons and the picker belong to each app's composer.
- **Progress, cancel, a hash.** None are shown or sent.
- **Surviving a reload.** An image message is sent from memory only. A reload or an OS kill mid-send
  loses it, and the row becomes a failed, delete-only leftover.

## How to verify

```bash
npx jest --config libs/app-runtime/jest.config.js libs/app-runtime/src/data/hooks/useSendImages
```
