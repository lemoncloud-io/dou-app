# Images, videos and documents

The composer takes images, MP4 videos and documents from the "+" button, a drop, or a paste. They
wait in a tray, and they go out with the message: the text first, then one attachment message with
the files. In the feed images are tiles that open a full-image viewer; a video and a voice file play
in place, and a document is a card that saves it.

The send itself is the runtime's, shared with apps/web: `data.useSendImages`, documented in
[`libs/app-runtime/docs/data/image-send.md`](../../../../libs/app-runtime/docs/data/image-send.md).
ADR-0135 records why desktop uses it. This document covers the screens. ADR-0129 records where they
depart from the Figma frames.

Components are in `features/chat/components/images/`, and the tray state is in
`features/chat/hooks/useImageAttachments.ts`.

## Adding files

- **"+"** (`AttachButton`) opens the OS picker directly. It used to open a menu whose only entry did
  the same. Its `accept` is `CHAT_ATTACHMENT_ACCEPT` from `@chatic/data`: every type and every
  extension, because a picker that does not know HWP's type only offers the file by its extension.
- **Drop:** `AttachmentDropOverlay` covers the pane while files are dragged over it: "Drop images and
  files here to upload", the ten-per-message limit, and a line saying voice files (the extensions and
  the 50 MB document ceiling, both read from the same tables the send uses) play right in the chat.
- **Paste:** pasted files join the tray. A rich copy (Excel, Word: `text/html` or `text/rtf` on the
  clipboard) also carries its text, and that text goes into the message as plain text. A file copied
  in Finder or Explorer carries only its own name as `text/plain`, and that is not inserted.

Every batch goes through `validateAttachments` (`features/chat/utils/chatImages.ts`), which gives
each refused file its reason, checked in this order:

- `folder`: a dropped folder. It arrives among the files as an empty, typeless file named like the
  folder; `useFileDrop` reads the drop's entries to tell it apart (only a drop can carry one).
- `empty`: a file of zero bytes, of any kind. The server refuses one when its upload completes.
- `unsupported`: not a format the server takes. `chatAttachmentFormat` in `@chatic/data` decides:
  PNG, JPEG, GIF and WebP images, MP4 video, PDF, DOCX, XLSX, PPTX, HWP, HWPX, TXT and HTML
  (`.html`, `.htm`) documents, ZIP archives, and M4A, MP3, WAV and OGG audio. HTML is the one format
  listed ahead of the server: desktop sends it, the phone app does not, and until the server takes
  `text/html` the upload is refused with a 415 and the message shows the failed file. Audio goes as a document (kind `file`):
  the message shows a file card that plays it in place (see below), and the web app does not send it at all. AAC
  and WebM audio are refused: the server does not keep them, and Chromium types a WebM from disk
  `video/webm`, a video the server does not take either. An empty or generic type (HWP arrives untyped on most systems) is read from the
  extension. So is an office file's: DOCX, XLSX, PPTX and HWPX are ZIP containers, and the browser types
  them by whichever app owns the extension on that machine — as a ZIP where none does, or under another
  suite's own name for them. Typed as a ZIP or as anything the server does not know, a file with one of
  those four extensions goes up as that document, never as an archive. A video or document whose
  extension names another format is still refused (a `.docx` typed as a PDF), because the receiver
  saves it under that name. Windows types a `.zip` as `application/x-zip-compressed`;
  it is sent as `application/zip`. Nothing reads an archive's bytes here; an empty one is refused
  as `empty` above.
- `too-large`: over its kind's limit, the same as the server's: images 20 MB, videos 300 MB,
  documents, archives and audio 50 MB. The server would refuse it with a 413 only after the whole transfer.
- `name-too-long`: the name as it will be sent (a document without an extension is given its
  format's) is over 255 UTF-8 bytes, the server's limit. Hangul is three bytes a character and an
  emoji four, so about 85 Hangul characters is already too many. The server measures the name
  composed (NFC) and so does the check, because macOS hands Hangul over decomposed. The server would
  refuse it with a 400 after the file is declared, and a retry can only fail the same way. The name
  is not shortened for the sender.
- `duplicate`: the same name, size and modification time as a file already in the tray or in the same
  batch.
- `limit`: over `MAX_ATTACHMENTS` (10).

A batch with any refusal adds nothing yet. `UnsendableFilesHost` (mounted once beside the panes; the
tray hook writes the batch to `useUnsendableFilesStore`) opens "Some files can't be sent" with every
refused file by name and its reason — the size ceiling for `too-large`, the ten for `limit` — and the
supported formats when one was `unsupported`. "Upload the other n" adds what fits; Cancel adds
nothing; when nothing fits there is only Confirm. A toast that counted refusals by reason came
before it: it said how many but not which, and added the rest unasked.

## The tray

`ComposerAttachments` is one row of 92px tiles that scrolls sideways, with an `n/10` counter. The
row used to wrap, and ten images took about 40% of the window. An image's preview shows a spinner
until its `<img>` has decoded; the tray tracks that itself rather than decoding each file a second
time. A video's or document's tile shows a kind icon, its name and its size.

Each channel and each thread has its own tray, kept outside the pane, so switching channels or
leaving for another page and coming back finds the files where they were — as the typed draft is
kept. It is in memory only (a page `File` cannot be stored), so it lasts as long as the window.
Every picked file gets an object URL, revoked on remove and on clear (a send clears the tray); the
URL stays alive while its tray waits in another conversation, or the tile would come back blank.

Clicking a tile opens the file at full size before it is sent (`ComposerPreview`), since the
tile is only a 92px crop or a name: an image or a video in the image viewer's frame with the picture
(held to the same upscale cap) or a player alone, and a PDF, text file or HTML page in the feed's `FileViewer`, read from the file the page
already holds instead of fetched. Neither has a sender, a save or a copy — there is no message yet —
and both say the file is not sent. A document the viewer cannot draw (office, Hancom, ZIP) is a
plain tile. A voice file opens nothing: its tile is a play/pause button that plays the picked file
from the tray's object URL. Before it plays it reads `Voice file · 0:42` (the length once the file's
header is read) rather than a size; the clock takes its place once it starts and a bar along the
bottom edge. It shares the feed's one-sound-at-a-time rule (below). A file the browser cannot decode
turns the tile plain — not a button, so nothing to focus — and says "Couldn't play this file" in
place of the size. A video the browser cannot decode (HEVC `.mov`) shows an empty player, as it does in the
feed. Removing the previewed file closes its preview.

The remove "×" sits on each tile's top-right corner. It surfaces on hover or focus (see
[keyboard.md](./keyboard.md#hover-revealed-controls)). Removing a tile moves focus to the tile that
takes its place, or to the message input once the tray is empty. A live region announces what joined
or left the tray.

## Tiles in the feed

`MessageImages` shows one image as a 180px tile, and several as a two-column grid of up to four. The
fourth tile counts the rest ("+n"). `ImageTile` states:

| State     | Looks like                                                | Says (button name)              |
| --------- | --------------------------------------------------------- | ------------------------------- |
| sent      | the thumbnail, or the original when there is none (a GIF) | "Open {name}"                   |
| uploading | blurred, with spinner                                     | "Uploading {name}", `aria-busy` |
| failed    | an image-off glyph                                        | "This image couldn't be loaded" |
| overflow  | dimmed, with "+n"                                         | "n more images"                 |

An uploading or failed tile is `aria-disabled`, not `disabled`, so it stays in the tab order and a
screen reader reaches it. A disabled button is skipped, and the upload, and its failure, had no
presence at all.

Over the tile's corner, `ImageActions` shows Download and a "More" button whose menu holds Copy and
Delete, as the design draws it. Delete shows only on your own messages. A sent upload has no
delete of its own on the server, so Delete there removes the whole message — its text and every
other image too — and the confirm dialog asks about the message, not the file. The menu renders in a
portal, so the pointer leaves the tile while it is open; the bar stays pinned visible until the menu
closes, otherwise it faded out from under the menu. The viewer keeps the three icon buttons.

"Download all" (in the feed and in the viewer) saves each image of the message in turn
(`downloadImages`). In the desktop app every image save goes straight into the Downloads folder,
with no dialog, and a name already there gets a number ("image (1).png"). The shell does this
(`apps/desktop/src/main/downloads.ts`): Electron's default is a save dialog per file, so saving six
images opened six dialogs. Only a PNG, JPEG, GIF or WebP whose name has the matching extension skips
the dialog; any other file still asks, so a script in the page cannot drop an executable unseen. In
a browser, Chrome may ask once whether the site may download several files.

When a save ends, the desktop app says so (`useDownloadNotices`, mounted once in `DesktopLayout`):
"Saved song.mp3" with "Show in Finder" ("Show in Explorer" on Windows), and saves that end within a
few seconds of each other — Download all — share one notice that counts them ("Saved 6 files"), its
button showing the last. A save that broke off says so; a save dialog dismissed says nothing. Only the
shell knows where a file landed or whether its dialog was dismissed, so it reports each download its
page started (`electronAPI.downloads.onDone`) and keeps the finished ones' paths itself: the page
names one by the id it was told (`reveal(id)`), never by a path, so it can only show what the shell
saved. A browser has no such notice.

Save and copy fetch the image's bytes (`fetchImage`) rather than pointing an anchor at its address:
a sent image lives on another origin, where Chromium ignores `download` and navigates instead. That
fetch skips the HTTP cache on purpose. The viewer, and a tile with no thumbnail, has usually drawn
the same signed address already — both read it from the same message the save does — through an
`<img>` that sends no `Origin`, and storage answers such a request without CORS headers or
`Vary: Origin`. The answer carries no `Cache-Control`, so Chromium keeps it for a while by
heuristic, and a CORS fetch that reuses it fails with "No 'Access-Control-Allow-Origin' header"
until the copy goes stale.

## Videos and documents in the feed

`toChatFiles` takes a message's videos and documents from its `upload$$`, and `toChatImages` takes
only the images, so the grid, "Download all" and the viewer never see a PDF. The kind is the
upload's `stereo`; a slot being sent reads it from the content type it kept. An image is named by
the upload's `name` — the one-image caption, the viewer and the saved file — and one with no name
(sent before the server kept names, or still being sent) by its place: `image-1`. `MessageFiles`
lists them under the images:

- **A video** plays in place (`<video controls preload="metadata">`). The original is signed for
  inline viewing, and Chromium plays an H.264 MP4 itself. The feed draws no poster, though a video
  sent from here carries one: the shared send hook draws a frame 0.5 s in and uploads it as the
  thumbnail, which is what the mobile feed's tiles draw. A video Chromium cannot decode (HEVC) goes
  without one.
- **A document** is a card with a kind icon, its name and size, and a save button. A PDF, text
  file or HTML page's name also opens it in the document viewer (below).
- **Two or more** videos, documents or voice files are headed "2 attachments ▾ | Download all". The
  count folds the list away and back; Download all saves each file there is something to load for,
  one after another, as the image grid's does.
- **A voice file** (M4A, MP3, WAV, OGG) plays in its card (`VoiceCard`,
  Figma "음성 파일 · 데스크탑 ③④"): a round play button, the name, and under it `2:05 · 17 MB` until it is played — the size
  alone while the header names no length, and `h:mm:ss` from an hour. Once played the line is a
  seek bar with `0:01 / 0:02` (the time played alone without a length), and a speed button steps
  1x → 1.5x → 2x → 1x. The button spins while the first press waits for sound. It streams from the
  signed address, reading only the header (`preload="metadata"`) until it is played, so a feed of
  voice files costs a few kilobytes each.
    - Download and a "More" menu end the card. The menu holds Download, Reply in thread (not inside
      the thread panel) and, on your own message, Delete file — which deletes the whole message, as
      an image's does, after the same confirm.
    - A name too long for the line gives way in the stem and keeps its extension in view; the whole
      name is in the hint.
    - **Being sent**, the button is a ring filling with the bytes sent (`useImageSendProgress`, by
      slot) and the line reads `Uploading 42% · 17 MB`; a spinner until the bytes are counted. An X
      beside it cancels the send (a document's card has the same X): the send is the whole message's,
      so every file in it stops, and the message goes from the feed instead of turning failed. Files
      already uploaded stay on the server, unreferenced. **Not sent**, the card is red
      and says so; Retry and Delete stay on the message's own failed line, so they are not offered
      twice.
    - **Cannot be played** (the address failed, or the browser cannot decode it): the button gives
      way to a plain mark and the line reads `Couldn't play this file · 17 MB`; download and the menu
      stay. If that happens while it plays, a toast says so too — the card may be out of sight.
    - **The detail dialog** (`VoiceDetailDialog`, Figma "음성 파일 · 데스크탑 ⑦⑧") opens from the
      name, or a click anywhere on the card outside its controls. It shows the sender and time with
      "Show in chat", the waveform as bars that fill as it plays, the name with `2:05 · 17 MB · m4a`, the seek
      bar with the time played and the time left, the speed, fifteen seconds back and forward, and
      play. Space plays and pauses, ←/→ move fifteen seconds and Esc closes, wherever focus is inside;
      Space on a focused button is not also a click. The header's download, More and close carry hints
      that wait half a second and open below. More holds Show in chat (closes the dialog and jumps the
      feed to the message, centred and flashed — `useMessageJumpStore`), Reply in thread and Delete
      file. Show in chat is offered only from the channel's own feed (`ChatPane` passes it down as
      `onShowMessage`): the thread panel, the threads page and Saved have no feed to land it in. The
      dialog is mounted once beside the panes (`VoiceDetailHost`, a small store the card writes to), not
      inside the row: the feed unmounts rows that leave its window, and a dialog in one would close and
      stop the file with it. For the same reason the host asks before Delete file, rather than the
      row's own confirm. Opening it puts focus on the dialog itself, not a control — every control
      carries a hint, and a hint opened by that focus would take the first Esc. The bars are the file's own waveform (`voiceWaveform.ts`):
      once the dialog opens it fetches the file and decodes it with Web Audio, each bar the loudest
      sample of its slice, the loudest at full height. It waits for the player's length and decodes
      only a file of ten minutes or less and 10 MB or less, the bytes counted as they arrive: a decode
      holds every sample at the file's own rate first, so its memory follows the length, and a
      low-bitrate hour would be gigabytes. Closing the dialog does not stop a load under way; its result
      is kept for the next open. A
      decode is kept for the page per address. Until
      it lands, and for good when the browser cannot decode the file, a pattern drawn from the name
      stands in — playback never waits on it, and the card streams the file on its own.
    - **Copy link**, in the card's More and the dialog's, puts a link to the message on the clipboard:
      `chatic://message/<cloud>/<place>/<channel>/<chatNo>`, `?root=<root>` for a thread reply, and
      `chatic-dev:` from the dev channel (the registry's `net.deeplink.desktopProtocol`, the scheme the
      sign-in hand-off uses). The cloud and place are the ones the reader is in at the click; the Default
      Cloud, which has no id in the session, is written `default`, the name the home screen switches
      to. Opened
      from anywhere on the machine, the shell hands it to the page as it does a notification's link
      (`parsePushDeeplink`), and the home screen goes to that cloud, place and channel and lands the
      feed on the message (`requestMessageJump`) rather than at the bottom; a reply opens its thread.
      The link carries no access of its own — it only resolves for someone already in that channel,
      which is the member-only link the design asks for without a server link. A message not yet
      numbered by the server has no link to copy.
      Opening one may switch the reader's cloud or place without asking, as a notification's click
      does; a channel the reader is not in is never reached, and the open lapses.
    - **Forward**, in the same two menus, sends the file again as a new message: the reader picks a
      channel of the place on screen, the same list as the quick switcher (`ForwardFileDialog`,
      mounted beside it in `ChannelList`). The server has no forward, so the file is fetched and sent
      through the usual attachment send to that channel (`useSendImages` keyed to the pick, with
      `attach: false`: that channel's own screen may be open, and its rows stay that screen's), as the
      reader's own message. A send runs once however the channel list remounts meanwhile, and the
      picker closes when the list goes, so a place switch never offers another place's channels. A toast says where it is going once the bytes are in; the row in that
      channel shows the upload as any send does, and a failed one stays there as failed. A file that
      will not load is reported and nothing is sent. Other places and clouds are not offered.
    - **One player per file.** Every view of one address — the card, the voice detail dialog, a tray
      tile — drives the same player (`voicePlayback.ts`), so the dialog picks up where the card is,
      at the card's speed, and a file paused for another keeps its place. The element is never put in
      the document: moving a playing element from one host to another would pause it.
    - **One sound at a time.** A voice file starting pauses every other voice file and every audio or
      video in the window, and any audio or video in the page starting pauses the voice files. Videos
      among themselves are left alone. `play` does not bubble, so the store listens for the page's
      media in the capture phase on the document, while at least one view holds a voice file.
    - The last view of a file letting go stops it: a card that leaves the page stops its playback
      unless the detail dialog still holds the file, and leaving the conversation stops what played
      there. A re-signed address is a new file to the player and starts over clean.
- **Being sent**, a video or document is the same card with a spinner, drawn from the name, type and size the
  pending slot kept (`localName`, `localContentType`, `localSize`), since there is nothing to preview.
  **Failed**, the card says so, and the message's retry resends it with the rest.
- **When only some files go**, the message is sent with those, and the rest follow it as a failed
  message of their own, with Retry and Delete. A subscription cloud that does not take a format
  answers `415 UNSUPPORTED` for that file alone; before this the refused file simply disappeared.
- **An upload from before the server kept names** has none; its card says "File" or "Video".

Saving goes through `downloadImage`, the same fetch-then-save as an image, under the upload's `name`,
or "file" for an upload with none; the extension comes from the type the bytes arrive with. The
name is the one the sender's app declared, and the app does not check it against the type again: the
server refuses, at upload, a video or document whose name ends in another format's extension.
The address must be `https:`; anything else is treated as nothing to load. A video or document is
never saved without asking: the shell skips the dialog for images only (above).

## The viewer

`ImageViewer` is a modal dialog over a plain scrim. Previously the app was frosted behind it.

- The picture fills the stage and keeps its shape, up to twice its own size, so a small image is not
  a speck in the middle of the window. Its element is sized to the photo itself (container query
  units), not letterboxed with object-contain, so the zoom-in cursor and click are on the photo only.
- Zoom runs from that fitted size up to 4×. A click on the photo zooms to 2.5× at that point; while
  zoomed, dragging pans and a click (a press that moved less than 4px) goes back to fit. The wheel and
  a trackpad pinch (a wheel with ctrlKey, at a stronger rate) zoom around the cursor. The bottom bar
  holds one raised pill: rotate, − , a slider, +, and a fit icon. The − and + buttons and the +, − and
  0 keys step by 1.5× around the middle; the slider sets the scale directly between 1× and 4× (its
  spoken value is the percentage); the fit icon, or 0, goes back to fit. A click, button or key glides
  to its zoom; the wheel, the slider and a drag follow the input directly.
- Rotate turns the photo a quarter clockwise per press and is not remembered: it is per picture, like
  zoom. A turned photo is fitted again as turned (its width is held by the stage's height and the
  other way round), and the pan limit uses the turned size, so a zoomed photo is re-clamped when it
  is turned. Stepping to another picture, or closing and opening again, starts at fit and upright.
- The single-image close button sits on its own surface, like previous/next, because a zoomed photo
  runs under it.
- The alt text is the position and the sender ("Image 3 of 10 from Ada"), not the file name.
- Previous and next, save, copy and delete are always on screen.
- ←/→ step through the set, and a live region says the new position. The dialog's description says it
  once on open.
- Several images get a side column that repeats the message: the author, "n files · Download all",
  every image as a thumbnail, and "Reply", which continues in the thread.

Closing returns focus to the tile that opened it (ui-kit's dialog focus return, ADR-0131).

## The document viewer

`FileViewer` opens a sent PDF, text file or HTML page in the app, in the same frame as the image viewer:
a header with the sender, the time and the file name, a save button and a close button. `canPreview`
decides which cards open it: PDF, TXT and HTML are drawn, and M4A, MP3, WAV and OGG are `audio`, which
plays in its own card instead. Nothing in the page draws a DOCX, XLSX, PPTX or Hancom file without
handing it, and its signed address, to a third party, so those stay save cards. A video already
plays in place.

A PDF, text file or HTML page still in the composer opens here too, before it is sent (see
[The tray](#the-tray)): the header names the file and says it is not sent, there is no save, and
the bytes are read from the picked file instead of fetched.

- **The bytes** are fetched when the viewer opens, the same way a save fetches them
  (`fetchFileBytes`: `https:` only, no cookies, past the HTTP cache). Closing mid-download aborts the
  fetch. A fetch that fails — an address older than its two-hour signature, say — or a file that
  will not parse shows "Couldn't open this file" with the save button, not a blank dialog.
- **A PDF** is drawn by pdf.js (`utils/pdf.ts`), loaded with a dynamic `import()` on the first open
  so the feed does not pay for it; the load starts alongside the file's download. It is the legacy build: the modern one calls
  `Map.prototype.getOrInsertComputed`, which Chromium does not ship yet (not in 142, nor in the
  shell's 130). The
  pages are canvases only, with no text or annotation layer, so a file someone else sent has no
  links or forms to act on; XFA is off and scripts never run. pdf.js also gets its data files — the
  Adobe CMaps and standard fonts a PDF may name without embedding (common in Korean files), the ICC
  profiles and the image-decoder wasm. The `pdfjs-assets` plugin in `vite.config.mts` serves them at
  `/pdfjs/<dir>/` in dev and emits them there in a build, leaving out the script-engine wasm.
  `PdfPages` lays the pages out in a column with a rail of numbered thumbnails beside it, as Slack
  does. Only pages near their scroll area hold a canvas, each sized for the screen's pixel ratio up
  to 16 MP, so a long file does not hold every page in memory. Every page keeps its own shape's
  height whether drawn or not, so drawing never moves the pages around it. A drawing still running
  when its page leaves, or when the width changes, is cancelled before the next one starts: pdf.js
  refuses two drawings on one canvas. A window drag redraws once it settles. The thumbnail of the page most in view is marked, and a
  thumbnail jumps to its page. Closing destroys the document and its worker, and so does a file
  that fails to open.
- **A text file** shows its first 1 MB in a wrapping monospaced block, with a line saying so when
  the file is longer; the save still writes the whole file. Only that first 1 MB is fetched (a
  `Range` request; if storage answers with the whole file, reading stops at 1 MB), and the card's
  size says whether there is more. A UTF-16 byte-order mark picks
  UTF-16; otherwise it is read as UTF-8, and as EUC-KR when the bytes are not UTF-8 — what Korean
  Windows usually saves a `.txt` as. One stray byte in a UTF-8 file therefore reads it all as EUC-KR.
- **An HTML page** is drawn as a page, in a frame of its own, because someone else wrote it. The frame
  has no permissions at all (`sandbox=""`): the page runs no script, submits no form, opens no window,
  and has an opaque origin, so it cannot reach the app, its storage or the bridge. It is never put into
  the app's own document. Ahead of the page goes a `Content-Security-Policy` that loads nothing from the
  network — styles, images and fonts the page carries inline still draw, but a remote image, which
  would tell the sender the page was read and from where, does not — plus no referrer and a
  `<base target="_blank">`. The frame may open no window, so a link without a target of its own opens
  nothing. A link within the page (`#part`) is inert too. A link that names its own target (`_self`) beats any base; what keeps that one from taking the frame to another site is the desktop shell's frame
  navigation gate, which refuses a frame navigating to an origin it does not trust. Served in a plain
  browser, the frame can follow such a link — the page it lands on still runs no script, but it is no
  longer under the policy. A `<meta http-equiv="refresh">` does not navigate a frame sandboxed without
  scripts. The policy goes first inside the page's `<head>`, where alone it counts. The page is parsed
  for that — with the browser's own parser, in a document that runs and loads nothing — and written
  back out with its doctype, so it keeps its layout mode. Finding the head by scanning the text was
  tried and dropped: a page can close a comment early (`<!-->`) so the scan and the parser disagree on
  where the body starts, and a policy that lands in the body is ignored. Anything outside the root
  element, such as a `<!-- saved from url=… -->` comment ahead of the doctype, is dropped. The frame is white whatever the theme: a page is written for a white sheet. The bytes
  are decoded as a text file's are, up to 10 MB; a page past that is not drawn, since a page cut short
  renders broken, and the viewer says it is too large and offers the save. Loading the page itself is
  not a navigation the shell's gate is asked about — it needs no exception for `srcdoc` (checked on
  Electron 33), and none should be added: the gate is what refuses a link that leaves.

The viewer opens with focus on close. Save is the first control, and focusing it opens its tooltip,
which would take the first Esc for itself.

In the Vite dev server pdf.js reports "Setting up fake worker": the dev server adds its client to the
worker file, the worker fails to start, and pdf.js parses on the main thread instead. A build emits
the worker file as it is, and it starts.

## Previews outside the feed

A message with attachments and no text still says something in the sidebar row and in the OS
notification, and it names what it carries (`shared/utils/messagePreview.ts`): "Photo" or "3 photos",
"Video" or "2 videos", "File" or "3 files", "Voice file" or "2 voice files", and "3 attachments"
when the kinds differ. It used to leave a blank line, and the banner read "Raine:" with nothing after
it; after that it said "Photo" for a PDF too, because the server now stores videos and documents as well.

Voice is desktop's own wording. The shared kinds have no noun for audio, so on their own a voice memo
reads as an attachment; here a message whose every slot is a voice file says so (`isVoiceSlot`). It
decides the way the feed's voice card does — by the slot's type and name, under `audio` or under `file`
— so an upload stored as `audio` with neither still reads as an attachment, as the feed draws it as a
plain file. A reply not yet sent (`outgoingMessagePreview`) and a saved card read the same. The push another device sends is worded by
that device and the server, and is not changed here.

A deleted message reads "Message deleted" in all of these (`sidebar.deletedPreview`): a server that
records deletes empties the body, which would leave a blank line, and an older one keeps it, which would
quote words the author took back.

The kind and count come from `chatAttachmentSummary` in `@chatic/data`. It counts from `upload$$`,
or from the `uploadIds` a channel head carries. Each upload's kind is its `stereo` (`image`, `video`,
`audio` or `file`), read by `uploadSlotKind`. A slot still being sent has no `stereo`: a video,
document or voice file is read from the content type its slot kept (a voice file as `audio`, the kind
the server will store it under, so its row does not change wording once sent), and an image slot, which keeps none, counts as
an image, so a photo on its way never reads as an attachment. A head that only has `uploadIds`
counts as images too. Kinds
that differ, and `audio`, read as attachments (a single one as "Attachment"). The rule is meant
to match how the server picks a push's body key, so a row and its push agree.

A push from another cloud reaches the renderer with the server's `loc_key` and `loc_args` untouched
(`shared/utils/pushBody.ts`). For an attachment key the body is made here with the same labels, taking
the count from `loc_args` whether it arrives as FCM's JSON string or as an array. Without this the
banner would show the shell's body, which is the first loc arg: a bare "3". A message push with no
text, which is how an attachment-only message is pushed until the server names kinds, and a plural
key whose count cannot be read both show "New message" instead of an empty line or a wrong number.
Any other push keeps the body the shell derived. Desktop uses the sidebar's nouns rather than the
phone's sentences ("Sent 3 photos"), because the same-cloud banner already prefixes the sender.
