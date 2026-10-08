# attachment send — photos, videos and documents (`useSendImages`)

> Status: wired into the room and the thread through the composer's attach button. Canonical code:
> [`hooks/useSendImages.ts`](../../../src/app/features/channels/hooks/useSendImages.ts) (this shell's
> binding) and
> [`components/ChatImageAttach.tsx`](../../../src/app/features/channels/components/ChatImageAttach.tsx)
> (the picking). The send itself — pending row, thumbnail previews, file memory, retry, leftovers —
> is the runtime's `data.useSendImages`, documented in
> [libs/app-runtime docs/data/image-send.md](../../../../../libs/app-runtime/docs/data/image-send.md),
> and the sequence it runs is `@chatic/data`'s
> ([libs/data docs/uploads](../../../../../libs/data/docs/uploads/README.md)).

`useSendImages({ cid, channelId, parentId? })` is that hook bound to this shell: `put` is the
shell's PUT for page files (below), `putShellFile` and `prepareVideo` send and convert the files the
app keeps (inside the app only), `onVideoRefused` shows why the app would not convert a video, and
`beforeSweep` — also run whenever the app comes back to the front — catches up with the transfers the
native shell finished while the page was away. `waitForConnection` (`runtime.data.waitForCloudSocket`)
holds the send for up to ten seconds until the room's socket is back: a pick from an OS picker is
answered as the app returns, while the socket that closed behind the picker is still reconnecting,
and the first request would otherwise fail. It returns `{ sendImages, retry, canRetry, discard }`.

## Which PUT

`bridge/shellUpload.ts` decides once per page, at the bridge seam:

| Shell                                | PUT                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| browser                              | `xhrPut` (`@chatic/data`) — the page's own `XMLHttpRequest`                            |
| app with the transfer module         | `nativePut` — temp file, `StartFileTransfer`, wait for the terminal state, acknowledge |
| app built before the transfer module | `xhrPut`, after the first request comes back `NOT_FOUND`; remembered for the page      |

**Only a photo crosses the bridge.** A page file that is a video or a document goes up by `xhrPut`
even inside the app: the native path would first copy it to the shell as base64 in one message, and a
WebView does not survive that for a 300MB file. The picked `File` is handed over as it is, which the
browser streams from disk. A file the app keeps (`ShellFileRef`, from the app's own picker, below) goes
through `putShellFile`: `StartFileTransfer` with the shell's own address and the declared size, no temp
file. It has no page fallback — only an app with the transfer module makes such files — so one that
reaches an older shell fails its slot.

The native path keeps moving bytes with the app in the background. It writes one temp file at a
time — each write holds a whole photo as base64 in page memory — while the transfers themselves
overlap. The fallback does not keep going in the background: it only runs while the app is in front,
and a PUT cut off by the background, or one stalled past its five-minute timeout, comes back as a
network failure, which the sequence retries. `runtime/upload/` holds the native sender and the transfer catch-up, each taking
the bridge it talks through, so neither reaches for `webClient` itself.

The native shell may also have finished transfers while the page was away. The binding catches up
(`ListFileTransfers` → settle → `AckFileTransfers`) on attach and whenever the app comes back to the
front. A finished transfer this page never started is acknowledged and dropped: the message it
belonged to lived in the memory of a page that no longer exists. A transfer this page is waiting on
that the shell no longer holds at all (evicted at its cap for unacknowledged results) is settled as
a failure, so its message cannot hang in "sending". The catch-up reads only uploads from the list: a download there
belongs to the viewer's save or share, which acknowledges it once the file is used
([image-export.md](./image-export.md)).

## Picking — `useChatImageAttach`

The composer's leading button opens the attach panel (below) — photos, camera, files. "Files" opens a
sheet (`AttachSourceSheet`), titled "파일", listing from files (documents) and then from the album
(photos and videos). The design also shows a third row, document scan; it is not drawn, since no
shell can scan a document yet. How photos are picked from the photos entry depends on the shell:

| Shell                                   | Photos                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| app with the photo-library bridge       | recent photos and videos in the panel, and the in-app grid (`PhotoGridSheet`) |
| app built before the bridge, or browser | the page's own file input, which the WebView hands to the OS chooser          |

The page learns which by asking: opening the panel requests the newest photos (`ListPhotos`), and an
app without the handler answers `NOT_FOUND`, which `bridge/photoLibrary.ts` remembers for the page. A
timeout is not learned from. The older app's own photo bridge is not used as a fallback: it ignores
what the page asks for and returns a device path the page cannot read, while the file input returns
real bytes — the profile and channel photo fields already rely on it inside the app.

The camera entry is a capturing file input in every shell, so it opens the camera directly and needs
nothing from the app. The photos entry's file input and the camera take photos only; the grid lists
videos too, in an app that has them (below).

The second sheet's two entries depend on the shell too:

| Shell                                   | Choose from album / Choose from files                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| app with the attachment picker          | `PickAttachments` — the OS photo-and-video picker, or the documents picker, through the app                                 |
| app built before the picker, or browser | the page's own file input: photos and `mp4`, or every format the server takes (and any file, judged after the pick — below) |
| …on iOS or iPadOS WebKit                | the album input takes photos only, and the sheet says where videos can be sent from                                         |

In the app the shell copies what was picked into its own folder and answers with addresses, never
bytes (`bridge/attachmentPicker.ts`). Photos picked alongside are kept there too, already prepared like
the grid's, and the page reads their bytes one photo at a time (`ReadAttachment`, two minutes each) in
pick order: the page resizes every photo itself, and ten photos in the pick's own answer would be some
200MB of base64, enough to take the WebView down — the grid reads one at a time for the same reason. A
photo whose read fails is refused alone, as `unreadable`. The pick resolves once every photo is read,
so the pending row appears with all of them. That is the album's pick, which goes out at once. The
documents picker's pick waits above the field (below), so a photo in it — the documents picker offers
the four photo formats too — stays in the shell as an address while it waits, and is read the same way,
one at a time, only when the send button is pressed (`readPhotos`). A waiting photo costs the page no
memory, and one over the 20MB photo limit is refused when it is picked, by the size the shell reported,
before any of its bytes cross the bridge.

The page asks at the tap, since the message itself opens the picker. An app without it answers
`NOT_FOUND` within one round trip, and the page then opens its own input in the same tap — as long as
the answer came within 800ms, because iOS lets a page open a file input only within about a second of
the gesture. A slower answer asks for another tap, and from then on the input opens straight away. A
`BUSY` answer — a second tap while the picker opens or copies — shows nothing: the first tap is still
under way. iOS WebKit's own input hands every picked video over as a QuickTime `.mov` after a silent
conversion of up to minutes, and the server takes only `mp4`, so there it is not offered videos at
all, and the sheet says so: inside the app, that an update sends videos
(`chat.attach.source.videoNeedsUpdate`); in a browser, that videos can be sent from the DoU app
(`chat.attach.source.videoInApp`).

The files input asks for every format this app sends — the server's formats but a ZIP archive, which
only desktop sends (`sendsFromMobile`); photos and `mp4` kept among files can go from there too — by
type and by extension, and for the generic `application/octet-stream` as well
(`documentAccept`). On iOS and iPadOS WebKit it names the seven document formats only, since an image
or video type there makes the system offer the photo library and the camera first. iOS WebKit matches neither HWP's MIME types nor `.hwp`/`.hwpx`
against the type the Files app gives such a file, so the seven alone grey HWP and HWPX out of its
document picker; the generic type admits them, and with them any other file. That is safe because the
page judges every pick itself (`chatAttachmentFormat`, which reads an untyped file's extension) and
refuses what the server would not take. Leaving `accept` out would admit everything too, but iOS then
offers the photo library and the camera before the document picker.

A video the app picked may still need converting (an iPhone records HEVC in QuickTime). The send converts
it with `PrepareVideo` after the pending row is shown — the tile is a grey panel until the poster comes.
Which files go through it is decided by the format, not by the shell's `kind`: an `.mp4` picked through
the documents picker is a video too, and is checked and gets a poster. A video the app refuses
(`too-large`: past about four minutes even at 720p; `unsupported`: an Android video that is not H.264)
fails as a message of its own, with a notice that says why. At 720p, the iPhone's last step down, a
minute runs about 76MB, so the 300MB limit lands near 3.9 minutes.

Only a passing failure can be retried. A video refused `TOO_LARGE` or `UNSUPPORTED`, one whose
converted result fails the page's own size check, and one the app lost (`SOURCE` — from `PrepareVideo`,
or from the upload's start, where iOS refuses a file that is gone) would only fail again, so its
message offers delete alone. A conversion that failed in passing (`SYSTEM`, such as the app leaving the
screen mid-way) stays retryable.

**The panel takes the keyboard's place.** `AttachPanel` is not a sheet. It lays itself along the
bottom of the room's (or the thread's) page container — exactly where the soft keyboard sits, under
the composer. Nothing is dimmed, the composer stays live directly above it, and its + turns into ×.
Its height is the last keyboard height seen on the page: `useKeyboardMemory` watches the root's
`style`, where the shell injects `--keyboard-height`, and keeps the last real one for the page's life
— one keyboard per device, so a height seen in one room serves the next. The shell's height runs down
to the screen edge, safe area included, so the panel's body is that height less the safe area and the
whole panel is as tall as the keyboard: trading one for the other moves nothing. Before any keyboard
has been seen, the body is the design's 306 px. The page keeps its composer and its list clear of the
panel as it does of the keyboard
([layout-shell.md](../../shell/layout-shell.md#the-attach-panel-takes-the-keyboards-place)).

**The keyboard and the panel hand over like one surface** (`useAttachPanelSlot`, the KakaoTalk
behaviour). Opening the panel drops the keyboard (the field is blurred), and focusing the field gives
the place back to the keyboard; neither moves the composer:

- **+ with the keyboard up** — or, in the app, with the field focused, since Android reports the
  keyboard's height only once it is up — puts the panel in place at once, behind the keyboard and at
  its height; the keyboard then slides away and reveals it.
- **Focusing the field** in the app keeps the panel in place while the keyboard rises over it, and
  removes it at once 300 ms after the keyboard's height first arrives (`KEYBOARD_COVER_MS`: iOS sends
  it as the keyboard starts to rise, Android once it is up). Without a height in 800 ms
  (`KEYBOARD_WAIT_MS` — a hardware or floating keyboard) the panel slides down instead, as for ×. In a
  browser no height ever comes, so it slides down at once.
- **+ with no keyboard** slides the panel up from below, and **×, back, camera, files and a send**
  slide it down. The composer moves with it, on the same frames: one frame loop moves both, 300 ms on
  the viewer's curve, and a slide asked for mid-slide turns around from where the panel has got to.
  Under the system's reduced-motion setting both move at once.

How the composer's padding does this — the larger of the keyboard and the panel, the panel's share
written by the slot at once or frame by frame, and the list following without a render per frame — is
in [layout-shell.md](../../shell/layout-shell.md#the-attach-panel-takes-the-keyboards-place). The
button reads + again from the focus on, while the panel may still be in place under the keyboard;
pressed then, it keeps the panel where it is.

× and Escape dismiss the panel, and Android back does too: while open, the panel is a non-modal
`role="dialog"` with `data-state="open"`, the shape `useBackHandler` looks for, so back reaches it as
Escape. It answers only while it is the topmost open overlay, so a grid or an editor opened above it
takes the press first. A composer lock that lands while it is open (a message being edited) slides it
down. Camera and "files" close it and open what they always did.

**Picking in the panel.** The recent row offers the 30 newest items (`RECENT_COUNT`) in a row that
scrolls sideways. A tap picks or unpicks in place: a picked tile dims and carries the grid's lime
badge with its place in the pick order, and at ten the unpicked tiles lock. The row and the grid pick
into one list (`usePhotoPicker`'s `picked`): "전체 보기" and the photos entry open the grid on it — its
edit button and its "묶어 보내기" checkbox with it — and closing the grid goes back to the panel with
the pick, and its edits, intact. A photo picked deep in the grid is part of the pick too, though the
row shows only the newest 30 — so the whole pick shows above the composer as well (below).

**The row is there before the library answers.** In the app, the first opening on a page asks the
shell for the newest items (`ListPhotos`, the probe above), and the panel draws before the answer
comes — 170 ms on an iOS simulator, seconds on an Android emulator. Meanwhile the row stands at its
full size in skeleton tiles (the kit's `RecentPhotoStrip` `loading`), so "사진", "카메라" and "파일"
under it are where they will stay; the photos take the tiles' places as they come. Told there is no
library (an app before the bridge), denied access, an empty library, or a probe that failed this time,
the row closes on the slide's timing and the entries rise with it. A browser never has a library and
never draws the row.

**The composer's send button sends the pick.** While anything is picked — in the open panel, or
waiting above the field once the panel has closed (below) — the send button is live even with an empty
field (`MessageInput`'s `sendReady`); only a composer lock, and a send already reading the pick, turn
it back to the text's. Pressing it sends the pick — by the remembered "묶어 보내기" choice, with every
edit — with whatever is typed as its caption, then clears the field and closes the panel if it is
open. The caption is the photo message's own text (`sendImages`'s
`content`): one message carrying the words and the photos, which the mobile and the desktop feed both
already draw. With "묶어 보내기" off it rides on the first message only
([libs/app-runtime docs/data/image-send.md](../../../../../libs/app-runtime/docs/data/image-send.md)).
The grid's and the editor's "N장 보내기" send the photos alone and leave the text in the composer;
sending from either closes the panel too. A caption whose pick turned out to have nothing that passed
the check goes back into the field (`onUnsentText`), unless something new was typed meanwhile.

**Files wait above the field too.** What "choose from files" gives — from the app's documents picker
or the page's files input — is not sent at the pick. It is judged then, exactly as any pick is, with
the one notice for the first reason met, and what passes waits directly above the composer's field as
a row of chips (the kit's `PickedFileStrip`: the kind's glyph, the name cut short with its extension
kept, the size, and ×), under the photo thumbnails when both wait. The composer's send button is live
for them, empty field or not, and sends them with whatever is typed as the message's caption — one
message. With an in-app pick waiting as well, the press reads the pick first and sends the photos and
the files together as one message, photos first; the "묶어 보내기" box is the grid's and speaks for its
photos alone, so it does not split that message. A photo among the files that is still in the app is
read at this press, before the in-app pick: one that cannot be read is refused alone under the
`unreadable` notice and the rest still go, and a read that fails outright keeps the files and the
in-app pick waiting and puts the caption back, as a pick that cannot be read does. The grid's and the editor's "N장 보내기" send the photos alone and leave the
files waiting. Files picked again join the row after those already there; the same page file picked a
second time is refused as `duplicate`. The per-message ten counts the waiting files and the in-app pick
together: past it a file is refused under the `limit` notice, the app's files picker is asked for no
more than the room left (and not opened at all, with the notice, when there is none), and the grid and
the recent row lock their unpicked tiles at what is left. Only × on a chip, and the send, let a file go
— closing the panel, × and Escape included, does not, since the file was never in it. **The waiting
files are kept per room or thread**, as part of its composer draft (`useComposerDraftStore`, in memory
only, never written out; [chat-room.md](./chat-room.md#the-composers-draft)): the hook takes a `scope`
— the channel id, or `channelId#rootNo` for a thread — and when it changes, puts the new
conversation's files in place before it paints, and lets the in-app pick and the panel go. That covers
leaving the room and coming back while the app runs, and the router keeping `ChannelRoomPage` and
`ThreadPage` mounted when only their params change (a push banner tapped in one room opens another):
a file picked for one room is never sent from the next. A send that finishes reading after the
composer moved on still takes the sent files out of the conversation they waited in. Without a
`scope` the hook keeps nothing. A composer lock hides the
row and holds the send; while a send reads the in-app pick or the waiting photos the row fades with the
thumbnails and the button waits, so the files cannot go twice. A file from the app — a photo included —
is only an address in the page; one left waiting for a day can be swept from the app's folder, and
then fails at the send as any gone shell file does. In a browser, where the in-app pick does not exist,
`strip` is rendered only while a file waits.

**What lets the pick go:** sending it, unpicking, × or Escape (back) on the panel, and leaving the
room — moving to another room or thread in the same page included: unlike the waiting files, the
in-app pick is not part of the room's draft. Focusing the field, camera, "files" and a composer lock close the panel and keep the pick, so a
caption can be typed after picking.

**The pick waits above the field.** Whenever some of the pick is out of sight — the panel is closed
(focusing the field closed it, most often), or it is open with a pick its recent row does not hold,
one made in the grid past the newest 30 — the whole pick shows as a row of small thumbnails directly
above the composer's field (`useChatImageAttach`'s `strip`, the kit's `SelectedPhotoStrip` at its
`compact` size: 48 px tiles, 8 px apart, in pick order, scrolling sideways). The send button stays the
pick's the whole time, so pick → type → send is one message with its caption, and a photo is never
sent from somewhere the person cannot see it. While the open panel's recent row holds every picked
item, that row shows the pick instead; while the composer is locked the row is hidden (the pick comes
back with the lock's end).

- **× on a thumbnail** unpicks it, the way unpicking in the grid does, edit and all. The field keeps
  its caret through the tap, so removing a photo while typing does not drop the keyboard. Once the
  last one is gone the button needs text again.
- **A tap on a thumbnail** opens the photo editor at that item, with no grid under it; "완료" and ✕
  go back to the composer ([photo-edit.md](./photo-edit.md#opening-it)).
- **A video** keeps its play mark; **an edited photo** is drawn with its edit and a pencil mark.
- **While a send reads the pick** the row stays, faded and inert, until the pending row takes its
  place — the field has already cleared, and a video still in iCloud can take a while.

The row is rendered inside the composer's bar, above the field, so the bar's measured height — what
the message list clears — carries it, and it rides up with the keyboard as the field does
([layout-shell.md](../../shell/layout-shell.md#the-attach-panel-takes-the-keyboards-place)). It is
always there while the in-app pick exists, handed an empty pick while there is nothing to show: it
opens from nothing as photos arrive and folds away as they go — the panel opening over it, the last
one removed, the send — on the panel's timing. The 8 px above the field is the row's own margin, in
what it opens and closes, so the composer grows and shrinks in one movement. The bar itself has no
surface, so the row brings a soft one: a rounded card in the field's own glass (white at 80%, black at
80% in the dark theme, blurred), flush with the field's left edge and 8 px above it.
Without it, a photo message scrolled under the composer ran into the thumbnails; on the room's plain
background the card does not show.

In the grid (`usePhotoPicker`) picks keep their order across albums; one page loads at a time, and a
page that lands after the album changed is dropped. Denied access opens a settings prompt instead of an
empty grid; iOS limited access shows a "choose more" row that re-lists after the system sheet closes.

**The grid's footer.** It slides up from below when the first item is picked and back down when the
last one is unpicked, on the panel's timing. Once something is picked, a row sits above the send button: "편집" on the left,
which opens the editor at the first picked item that can be edited, and — once two or more are
picked — a "묶어 보내기" checkbox on the right (below). A tap on a thumbnail in the picked strip opens
the editor at that item. The editor, the edit it keeps and how an edited photo is drawn at the send
are in [photo-edit.md](./photo-edit.md). "편집" is greyed when nothing picked can be edited — only
videos, or GIFs already read.

**One message, or one each.** The checkbox is on by default: the pick goes as one message, as it always
did. Off, every item that passes the judge goes as a message of its own, in pick order
(`sendImages(accepted, { separately: true })`): the runtime writes all the pending rows first and then
sends them one after another, so the feed shows the whole pick at the press and the server numbers the
messages in pick order. Nothing sent in the room meanwhile lands between them: a camera photo or another
pick sent before the last of them has gone waits for it. A message that fails is retried or deleted on
its own ([libs/app-runtime docs/data/image-send.md](../../../../../libs/app-runtime/docs/data/image-send.md)).
The pick is judged whole first, so the one-notice rule and the ten-item cap still hold — off, a pick is
at most ten messages. A pick where one item passes is sent the usual way either way. The choice is kept
in `ui.photoSendGrouped` (local, `usePhotoSendGrouping`) and is how the grid opens next time, the way
a chat app's "send photos as one" setting is remembered rather than asked each time. Only the grid has
the checkbox: the file inputs, the camera and the app's own picker always send one message.

**The grid's layout.** The title row (album name, close) and the picked strip stay put; the limited-access
row and the grid scroll beneath them, in a container of their own that `BottomSheet` is pointed at
(`scrollRef`) so swipe-to-dismiss still arms only at the grid's top. The album list scrolls under the
same title row.

**A virtual grid, paged by position.** `PhotoGridSheet` renders only the rows on screen and four either
side, and tells the hook which photos those are (`onVisibleRangeChange`). The hook keeps two things
apart: which photo sits at each position (ids, small) and the previews (base64, by id). As each page
lands, the previews of pages more than two away from the visible ones (`keptPages`) are let go and
those pages forgotten, so a long scroll holds a few hundred previews rather than every one it passed;
the positions stay laid out, and a page scrolled back to is asked for again. A list paged by cursor
(an older app) keeps its previews: its pages cannot be asked for out of order, and they are small.

Pages are 60 photos asked for by `offset`, one request at a time, the page nearest the middle of the
range first: a fast-scroll drag passes many pages, and only the one it stops on is still wanted. The
first page is 24 (`FIRST_PAGE_SIZE`, about a screen at three columns), and the rest of page 0 follows
as its own request. The shell makes previews one after another, and on Android a photo the system has
never made a thumbnail for costs 40–110 ms on an emulator (a page of 60 took up to 7 s), so a first page
of 60 kept the first screen waiting on 36 photos it does not show. Once everything on screen is in, the
page past the range in the direction of the scroll is asked for too (`pageAhead`), so a steady scroll
finds the next stretch there; a cursor list asks for its next page a page's worth before the end. An
answer that moves nothing on — an offset other than the one asked for, at the same count — does not go
round again. The first answer carries the album's `total`, so the grid is its full height from the start
and any stretch of it can be filled directly. A position whose preview has not come — its page not loaded yet,
or let go far from the screen and on its way back — is a pulsing skeleton tile. While the album's first
page is out, the grid fills the screen with them rather than standing empty. A photo the app could make
no preview of is a plain tile, without the pulse, and is still pickable. Every preview (grid, recent
strip, album cover) cross-fades in: its skeleton fades out as the decoded image fades in over 300 ms,
both instant under the system's reduced-motion setting (`PreviewImage`). When a later page reports a different
`total`, the library changed under the grid — every index after the change has moved — so the layout is
remade at the new length and the pages on screen are asked for again; the previews already held are by
id and stay.

An app from before offsets ignores the field and answers the first page with no `offset` in it. The
first request is always offset 0, so that answer is still the right page; `bridge/photoLibrary.ts`
learns from the missing echo once per page load, and the grid pages by cursor from then on, growing as it
scrolls the way it always did. The handshake's `supportedWebMessages` is not used for this: it arrives
asynchronously, it lists messages rather than the fields a handler reads, and it is built from the app's
compiled message map rather than the handlers it registered — the answer itself is the only reliable
witness.

**Preview size.** Every list asks for previews at the size the tiles are drawn: the tile's CSS width ×
`devicePixelRatio`, rounded up to 16 (`thumbSize`; a 390pt phone at three columns asks about 400px). The
app answers a square crop of that size ([apps/mobile native/photo-library.md](../../../../mobile/docs/native/photo-library.md)),
except that iOS answers a size above 352px and up to 440px at 352px. That is the rendition Photos keeps of
every photo: past it, each preview is a decode of the original and a page takes seconds. The panel's
recent row and the album covers ask for theirs the same way. An app from before the field answers its old
~256px previews, which draw a little soft and need no fallback.

**Fast scroll.** A grid longer than three screens shows a handle on its right edge while it scrolls,
fading 1.5 s after. Dragging it moves the scroll in proportion — the handle's place on its track is the
scroll position's place in the content — and, with offsets, the grid fills wherever it lands. With an
older app the content is only as long as what has loaded, so the handle covers that. It has no date
label: an item carries no date, and a position not yet loaded has none to show. It is pointer-only and
hidden from assistive tech, since the grid scrolls by every other means.

**Pinch for columns.** Two fingers on the grid step it between 2 and 5 columns (default 3), one step per
1.3× of spread or pinch. The page already disallows zoom (`user-scalable=no`); the grid also takes
`touch-action: pan-y`, cancels the two-finger `touchmove`, and cancels iOS WebKit's `gesturestart` /
`gesturechange`, so the page never scales under it and the gesture is the grid's on both WebViews. The
layout changes at once — no animation — and the scroll is set so the photo under the fingers stays under
them. A pinch never reaches the sheet's drag. The count is kept in `ui.photoGridColumns` (local) and
used again on the next open. When tiles grow past about 1.2× the size their previews were asked at
(three columns to two), the pages on screen are asked for again at the new size; a smaller step (five to
four) keeps what it has. There is no button for the columns: three columns is the whole picker, and the
pinch only changes how many fit on screen.

**Videos in the grid.** Every list asks for photos and videos (`mediaTypes: ['image', 'video']`). An app
from before videos ignores the field and lists photos only, so asking costs it nothing; one that lists
a video also has `KeepLibraryVideo`, which arrived in the same build. A video draws as its poster frame
with a play mark and its length (`m:ss`) — in the grid, the panel's recent row, and the picked strips
of the grid and above the composer (there without the length). On Android the app lists videos only once the user has granted video access
as well; it asks for that once (ADR-0171).

**Sending** reads the pick one item at a time in pick order: a photo with `ReadPhoto` (base64 — the app
converts HEIC to JPEG and removes the location) unless the editor has read it and still holds its
bytes, which it does while the grid is open and for its own send button, opened over the grid or over
the composer alike ([photo-edit.md](./photo-edit.md#reading-the-photo-for-the-editor)); a photo with an
edit drawn with it ([photo-edit.md](./photo-edit.md#the-edit-is-drawn-at-the-send)); a video with
`KeepLibraryVideo`, which copies it into
the app's pick folder and answers with the same shell-file reference "Choose from album" gives — from
there it is converted and uploaded as any app-picked video is. The app judges a video as it copies
it: an Android video that is not H.264/AAC `mp4` is `UNSUPPORTED`, one over the size limit (iOS: its
conversion's estimate) is `TOO_LARGE`. An item that cannot be read or kept is refused alone, and the
rest still go. The grid stays open with its send button greyed out as "준비 중…" until every item is
read — a video stored only in iCloud can take minutes to come down, with no progress to show — then
closes, and the pending row appears with everything that was read. A send from the composer closes the
panel at the press, and its row appears the same way, once the pick is read; meanwhile the row of
thumbnails above the field stays, faded. A `NOT_FOUND` from
`KeepLibraryVideo` — an app that lists videos but cannot keep one, which no release ships — is learned
for the page: lists stop asking for videos, and the grid lists afresh without them when it next opens.

What is picked is judged before anything is sent (`judgeChatAttachments` in `@chatic/data`; the photos
entry's file input and the camera use its image-only form, `judgeChatImages`): the twelve formats this app sends (a ZIP archive, which the server also takes, is `unsupported` here: the phone cannot save one it receives), each kind's
own limit (20MB a photo, 300MB a video, 50MB a document), the same item picked twice, and ten a message
(`IMAGE_MESSAGE_SLOT_MAX`). What the app's picker would not copy is reported the same way: each of its
refusals carries the item's `kind`, so a too-large one names that kind's limit, and an unsupported
video says it is the video's format. The grid's own refusals are reported the same way. The first reason met
is shown once, naming the kind whose limit was passed or what an unknown format looked like. From the
photos entry's input, the camera and "choose from album", whatever passes is sent at once — there is
no tray and no confirmation, the pick is the send. The in-app pick — the panel's recent row and the
grid — waits for a send button, and before it is pressed it can be edited, split into one message each
and given a caption (above, and ADR-0179, which narrows ADR-0123's "the pick is the send" to the other
paths). "Choose from files" waits for the send button too, above the field, and takes the typed text as
its caption (above, and ADR-0182). A grid photo whose edit could not
be drawn is refused alone, and its notice ("편집한 사진을 만들지 못했어요") is the one shown for that pick,
ahead of any other reason.

The button shares the composer's lock (nobody left in a 1:1, a message being edited). In a thread it
also stays locked until the root is loaded: a reply needs the root's full id, and a photo sent without
one would land in the main feed.

## Rendering

`MessageImages` splits a row's `upload$$` with `chatMediaItems` (`@chatic/data`): photos and videos as
one list of media in the order they were sent, drawn by the kit's `MessageMediaTiles`, and documents as
`MessageFileCard`s below them. A video tile draws its poster (the upload's thumbnail) with a play mark.
One sent without a poster — from a browser that could not draw one, or before browsers sent one — gets
its first frame drawn on this device instead (below), and is a grey panel until then. Nothing in the
feed plays. A tapped photo or video opens in the kit's `MediaViewer`, which plays a video
there and only there (below). With no text the attachments take the
bubble's place — an empty bubble beside them would read
as a blank message; with text they sit under it. A pending slot draws from its `localThumbUrl` with its
`localStatus`; a server head from `thumbUrl`, falling back to `orgUrl`. A GIF is sent without a
thumbnail (`prepareChatAttachment` in `@chatic/shared`), so its tile draws the original and plays: a
thumbnail is its first frame only, and the head carries no content type to tell a GIF's thumbnail
from a photo's. A GIF sent before that has a thumbnail and stays still in the row; it plays in the
viewer. A head the server marks failed, carries an error, or has no address stays as a broken tile, so
the count still matches what was sent.
The tiles are fixed-size: the server embeds no dimensions. A tap opens the viewer; a hold opens the
message's action sheet, as on a bubble ([chat-room.md](./chat-room.md#a-message-row)).

The addresses are signed when the message is read and expire a couple of hours later, and a cached row
keeps them. An image that fails to load draws as a placeholder and the message is read again from its
own cloud (`useImageAddressRefresh`), which writes fresh addresses to the cache; the row redraws with
them. Each dead address is re-read once, so an address that fails again stays a placeholder rather than
looping, and a later expiry — a different address — gets its own re-read. The viewer holds a position
rather than an address, so a refresh reaches it while open. Local previews are never re-read.

The viewer opens at the tapped image and steps through the rest of the message's images, with a
"2 / 3" count. The images sit side by side on a strip: a sideways drag moves it under the finger, and on
release it slides on to the next image or back, the same slide the arrow buttons and keys use. Only the
showing image and its neighbours load, and each draws its thumbnail — usually already kept, since the
tile drew it — until the original has arrived, so a large original opens on a picture rather than on
black. The viewer reaches the images behind the "+n" tile too, and skips
broken ones rather than showing a blank page. It stops at the ends instead of wrapping.

The viewer slides up from the bottom edge as it opens and back down as it closes. A downward drag
pulls it after the finger while the black behind it fades; released past a sixth of the screen height
(at least 96 px), or flicked down past 48 px, it carries on down and closes, otherwise it settles back.
The close slides on from wherever the finger let go rather than from the top, so the photo does not
jump back before it leaves, and the photo it was showing stays on screen until it is gone — the
viewer keeps its last position through the close instead of falling back to the first item. A video
stops the moment the close starts. A zoomed photo pans on a downward drag instead of closing, and a
drag on a video's controls is left to them.

The showing photo zooms, in the kit's `MediaViewer` with its arithmetic in `imageZoom.ts`. A pinch
scales it around the point between the fingers, up to four times. A double tap on it zooms to 2.5
times at that point, or back out. While it is zoomed, a one-finger drag pans it instead of turning
the page, and the photo's edge cannot be pulled off the page. A tap beside a zoomed photo does not
close the viewer. Turning the page or closing starts the next image fitted again, and a pinch that
ends barely zoomed snaps back. The browser's own pinch is not used: the app fixes the page scale
(`user-scalable=no`), and the browser would zoom the whole screen rather than the photo.

A video in the viewer is the OS player (`<video controls playsInline preload="metadata">`) over its
poster, fitted between the top and bottom bars so the player's own controls are never under the bottom
bar. It does not zoom. A horizontal drag still turns the page, except one that starts in the bottom
72 px, where the player's seek bar is. Opening a video from its tile tries `play()` within that tap —
Android refuses a play that comes about five seconds after the gesture, so nothing is awaited first, not
even a fresh address; when the play is refused a large play button takes the next tap. Turning away
pauses it, rewinds it and detaches its address, so the download stops; closing stops it at once,
before the viewer has slid away. The player streams from the signed address with range requests,
so no video is cached or fetched ahead — only its poster is. A player error asks for fresh
addresses, as a photo's does. Inside an iOS app built before inline playback, the play opens the OS
full-screen player instead.

Retry of a failed image row goes to `retry(pendingId)`, not the text path (which would send the row's
empty `content`). Whether it can is asked at the tap, not while drawing — the file map is not React
state, and the send lets a retry in only after it has marked the row failed. A row whose files are gone
— a reload left it behind — answers with a notice to delete it. Deleting
discards the files as well. The home list previews an image-only last message as a photo count — the kind rule for every attachment is in
[home's last-chat.md](../home/last-chat.md#what-the-row-prints).

### The first frame of a video without a poster

`useVideoFrames` (over `lib/videoFrames.ts`) runs for a sent video slot with no `thumbUrl`, in one of
the four tiles a message shows, and only once the message is on screen (`useInView`, an
`IntersectionObserver`). The server's thumbnail always wins; none of this runs for a video that has one.

1. **A frame made before** is read from the image cache under `<cid>/<uploadId>/frame` — memory, then
   `ChaticImageCacheDB` — and drawn at once.
2. **Otherwise one is made now**, two at a time for the page. A request still waiting when its message
   leaves the screen is withdrawn; one already started runs on, and what it makes is kept.
    - **In the app** the shell makes it: `ReadVideoFrame { url, atMs: 500, maxEdge: 400 }` (the shell's own 20 s limit; the page waits 25 s,
      so a read still running in the shell is never taken for over). The
      page cannot: the iOS WebView loads no media before a tap, `blob:` addresses included, and that
      setting is not changed. The JPEG is `put` into the cache.
    - **In a browser** the page fetches the video's first 2 MiB — `mode: 'cors'`, no credentials,
      `cache: 'no-store'`, `Range: bytes=0-2097151` — and draws the frame from those bytes with the poster
      routine (`drawVideoFrame` in `@chatic/shared`). `no-store` is required: a copy a `<video>` or
      `<img>` left in the HTTP cache carries no CORS headers, and a fetch served from it fails as if the
      bucket had none.
3. **Where no image can be made, the tile draws the frame itself**: `MessageMediaTiles` gets a
   `frameUrl` and places `<video muted playsInline preload="metadata" src="…#t=0.5">`, which never
   plays. Without the `#t=` fragment the engines measured show only their default grey. This is the
   path for a browser whose fetch could not be made (learned once per page: the bucket sends no CORS
   headers), for a video whose first 2 MiB do not draw (index at the end, a 4K first frame past
   2 MiB), and for an Android app from before `ReadVideoFrame`. An iOS app from before it stays grey —
   its WebView would load nothing.

A frame that could not be made is remembered for the page, so a tile that comes back on screen does not
read the video again. A failure that is the video's own — its first bytes do not draw — is remembered by
upload, since the message is re-read with a new address on every visit; one that may be the address's —
a 403, a failed shell read — by upload and address, so a refreshed address gets its own try. An answer
that is not a partial one (`206`) means the server ignored the range and is sending the whole video; its
body is never read, and the tile takes the `<video>` path instead. The viewer uses a
made frame as its placeholder while the video loads.

### The image cache

What a server head draws is read through a cache keyed by the image, not by its address
(`lib/imageCache.ts`, `hooks/useCachedImages.ts`). The key is `<cid>/<uploadId>/thumb|org|frame`: an upload's
bytes never change, while its signed address changes on every read of the message. The signing time is
rounded to the hour, but the signing credential's token differs from read to read, so a browser cache
keyed by URL missed every time. A room opened from the cache drew its images, the background re-read
handed the same images new addresses, and all of them were downloaded again. The cloud is in the key
because an upload id is only unique inside the server that issued it.

A drawn image is looked up in memory (object URLs), then in the page's own IndexedDB database
`ChaticImageCacheDB` (`lib/imageCacheStore.ts`, apart from `libs/db`'s chat cache because there is
nothing to migrate with it), and only then fetched once from its signed address. While it is looked up
the tile is an empty square. Nothing races a download of the address alongside the lookup, because
that download is exactly what the cache saves. A key already in memory resolves in the same render, so
a redraw with a new address does not blink.

- **`frame` is made here, not fetched.** A video's first frame (above) has no address of its own, so
  it enters through `put` and is read back through `lookup`, which never touches the network. It keeps
  a budget of its own (20 MB, beside 50 MB of thumbnails and 150 MB of originals): a frame costs a video
  read to make again.
- **The signed address is the fallback and the failure signal.** If the fetch cannot be made — a 403
  from an expired address, a bucket without CORS, offline, a body that is not an image — the tile draws
  the address directly, and the expiry re-read above runs from its error as it always did. A kept copy
  that fails to decode is dropped and falls back the same way, without a re-read: its address was never
  the problem.
- **Never worse than the address.** A store read that takes more than a second counts as a miss, so a
  hung IndexedDB open cannot hold every tile blank; the store also lets go of a connection that was
  closed or upgraded elsewhere and opens a new one. After a fetch that got no answer at all, loads skip
  fetching for a minute and draw addresses directly.
- **Only what is drawn is asked for:** a message's four visible tiles, and in the viewer the showing
  original and its two neighbours, with their thumbnails. No original is fetched before the viewer
  opens — except for a tile with no thumbnail, a GIF, which draws its original and keeps it under the
  `org` key, where the viewer finds it too — and the neighbours' originals only once the showing one
  is in, or has fallen back to its address: fetched side by side, three originals of several MB split
  a slow network three ways, and the photo being looked at took three times as long. Until then a
  neighbour draws only what memory already has (so the photo sliding out does not drop to its
  thumbnail), and a neighbour still downloading, the photo just swiped away from, is let go and
  cancelled with the rest below.
- **A download nobody draws is cancelled** at the next sweep (below), unless something took the image
  again by then. The bucket answers over HTTP/1.1, so the page gets about six connections to it. Before
  this, swiping through ten photos on Slow 4G left the originals already swiped past holding all six,
  and the photo on screen, its thumbnail included, stayed black for over a minute behind them. A
  cancellation is not a failure: it does not start the one-minute fetch pause.
- **Budgets:** 50 MB of thumbnails and 150 MB of originals on disk, evicted least recently used first
  and counted apart, so a few opened photos (an original is uploaded as picked, often several MB) cannot
  push every thumbnail out. A hit moves an image's place in that order at most once an hour. In
  memory, up to 40 MB of object URLs that nothing is drawing stay around, ordered by when they were last
  drawn. An image being drawn is never revoked, and memory is swept a second after a release: a redraw
  lets go of its images and takes them again in one commit, and the render reads the cache a frame
  before its effect takes them.
- **Kept past its address.** A kept image stays viewable after its address would have expired, or after
  the account lost access to the room — the same posture as the chat cache, which keeps the rows
  themselves. Neither is cleared on logout.

The trade-offs, and the server-side fix that would make the address itself cacheable, are recorded in
[ADR-0128](../../../../../docs/adr/0128-chat-images-are-cached-by-upload-not-by-signed-address.md).

### Document cards

A card shows the format's icon, the name in two lines with its extension always visible, the size, and
a download button at its right edge. An upload older than names says "File". A pending card draws from
the slot's `localName` / `localSize`, a server-failed one is dimmed and says it cannot be opened.

In a browser the button and the card both download (`lib/fileDownload.ts`): the bytes are fetched into
a `Blob` and saved from a local address under the upload's own name, since an anchor's `download`
attribute names nothing on the bucket's origin. The whole file is in memory meanwhile, which the 50MB
document limit keeps affordable. A 403 means the signed address expired: the message is read again for
fresh ones and the user presses again.

Inside the app the WebView ignores `download`, so the shell does the work (`lib/fileExport.ts`, driven
by `hooks/useFileDownloads`). The shell downloads the file — the button shows the byte progress, and
pressing it again cancels — and the page hands the downloaded file to the OS:

| Press                     | What follows the download                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| The button                | `SaveFile` under the upload's name. Saved: a toast says where, with an Open action. The iOS export sheet dismissed: nothing.    |
| The card body             | `OpenFile` — QuickLook on iOS, the system viewer on Android. `NO_HANDLER` (an HWP, usually) puts it on the share sheet instead. |
| A `done` button           | `OpenFile`, as the body.                                                                                                        |
| Long press → "Share file" | `ShareFile`. A message with several documents shares the first one only — one row, rather than a picker inside the sheet.       |

The downloaded file is remembered for the page's life by the card's key, so the card turns `done` and
the next open, save or share hands over the same file without downloading again. The shell keeps the
file after any of the three, and acknowledging the download drops only the shell's record of it. The
recoveries:

- **403, once.** The message is read again for the upload's new address and the download runs once
  more; a second 403 is a failure.
- **`SOURCE`, once.** The OS cleared the file. It is forgotten and downloaded again.
- **`NOT_FOUND` from `OpenFile` or `SaveFile`.** An app built before them. Nothing tells the page up
  front — the handshake only lists the photo messages — so it is learned from that first answer, and
  every card then shows its update notice until the page reloads. A shell with no downloads at all is
  learned the same way.
- **`PERMISSION_DENIED`.** Android 7–9 asks for the storage permission on the first save; a refusal
  says saving needs it and offers the settings.
- **`UNSUPPORTED_TYPE` from `ShareFile`.** An app that shares photos but predates documents: a toast
  asks for an update.
- Anything else says the file could not be downloaded. A cancel, a timeout and a closed sheet say
  nothing.

"Share file" appears only inside an app whose handshake lists `ShareFile` (the check the viewer's photo
share uses), and never in a browser, where the button already saves the file.

## Not done here

- **Upload progress, cancel, a hash.** None are shown or sent.
- **Documents surviving a reload inside the app.** The record of which file the shell downloaded lives
  in the page, so after a reload the card is `idle` again and the next press downloads once more.
- **Save and share from a tile.** The viewer has them for photos and videos inside an app that can
  ([image-export.md](./image-export.md)); a tile does not. A right-click on a tile opens the
  message's action sheet, not the browser's image menu (ADR-0136).
- **Surviving a reload.** An image message is sent from memory only. A reload or an OS kill mid-send
  loses it, and the row becomes a failed, delete-only leftover.
- **A cacheable address.** Making the signed address stable across reads, and giving the objects a
  `Cache-Control`, is the server's side and not done; the page cache above works around it.
- **A display-size original.** The viewer opens the original as uploaded. A smaller copy for the screen
  would need the server to make one, or the send to resize the original — a product decision.

## How to verify

```bash
npx jest --config apps/web/jest.config.js apps/web/src/app/features/channels/hooks/useSendImages \
  apps/web/src/app/runtime/upload apps/web/src/app/bridge/shellUpload \
  apps/web/src/app/features/channels/components/MessageImages \
  apps/web/src/app/features/channels/components/ChatImageAttach apps/web/src/app/bridge/attachmentPicker \
  apps/web/src/app/features/channels/lib/fileDownload apps/web/src/app/features/channels/utils/attachSources \
  apps/web/src/app/features/channels/components/ChannelMessageRow \
  apps/web/src/app/features/channels/lib/imageCache apps/web/src/app/features/channels/hooks/useCachedImages \
  apps/web/src/app/features/channels/lib/videoFrames apps/web/src/app/features/channels/hooks/useVideoFrames \
  apps/web/src/app/features/channels/hooks/usePhotoPicker apps/web/src/app/bridge/photoLibrary \
  apps/web/src/app/features/channels/hooks/usePhotoGridColumns \
  apps/web/src/app/features/channels/hooks/usePhotoSendGrouping \
  apps/web/src/app/features/channels/hooks/useKeyboardMemory \
  apps/web/src/app/features/channels/hooks/useAttachPanelSlot \
  apps/web/src/app/features/channels/utils/slotSlide apps/web/src/app/ui/hooks/useChromeInsets \
  apps/web/src/app/features/channels/utils/bakePhotoEdit \
  apps/web/src/app/features/channels/pages/ChannelRoomPage apps/web/src/app/features/channels/pages/ThreadPage
npx nx test web-ui-kit -- photoGridLayout PhotoPicker BottomSheet photoEdit cropBox PhotoEditor EditedPhotoImage \
  AttachPanel MessageInput PickedFileStrip
```

The panel's place and motion need a device, iOS and Android both, since their keyboards report at
different moments: open it with the keyboard up and the composer should not move, nor should anything
flash between the keyboard and the panel; tap the field and the keyboard should rise over the panel
the same way. With no keyboard up, + and × (and Android back) should move the composer with the panel,
in one motion; so should a tap on the field with a hardware keyboard attached, a moment later. Record
the screen for those: frame by frame, the composer's pill and the panel's top edge move in the same
frames, 8 px apart. + then × before the panel has risen should turn it around where it is, with no
jump. Then pick two photos, tap the field and type: the two slide in above the field as the keyboard
comes up, × on one leaves the keyboard up, a tap on the other opens the editor, and the send button
sends the one left with the text as one message. Pick one from "전체 보기" past the newest 30 and close
the grid: with the panel still open, the pick shows above the composer too. On a page's first opening
in the app the recent row should be there from the first frame, in skeleton tiles, with the three
entries under it not moving when the photos come; in an app built before the photo bridge, the row
should close and the entries rise.

The send itself and `xhrPut` are tested where they live — see the runtime doc and
[libs/data docs/uploads](../../../../../libs/data/docs/uploads/README.md).

To see the cache work, send a photo in a room, reload, and open the room again: the tiles' `src` are
`blob:` addresses, `ChaticImageCacheDB` holds one `meta` row per image, and a `PerformanceObserver` on
`resource` entries sees no request to the bucket when the room is left and re-entered.
