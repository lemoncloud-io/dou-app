# Chat

Pieces drawn inside a chat room: the attach flow, the content of a message, and the strips around the composer.

## Attach flow

- `AttachPanel`: sits in the place the soft keyboard takes, directly under the composer. It is not a sheet: nothing is
  dimmed or trapped, the composer stays live, and focusing it is how the keyboard takes the place back (the host
  closes the panel then).
    - It positions itself at the bottom of its containing block. The host keeps its composer and list clear of
      `height` plus the safe area. `height` excludes `--safe-bottom`; the panel adds that itself.
    - `enter` / `exit` of `instant` skip the slide. Use it when the keyboard is the thing moving: the panel only has
      to be there, or not, under it. Default is `slide`.
    - While open it is a non-modal dialog marked `data-state="open"`, the shape the app's back handler looks for, so
      Android back arrives as Escape. It closes on Escape only when it is the topmost open overlay (a photo grid or
      editor above it gets the press first). The overlay selector is a copy of the app's, because the kit cannot
      import the app; if the two disagree, back closes one overlay and Escape another.
    - `recent` is the recent-photos row. Omit it where the shell cannot read the library (a browser, or an app
      that predates it) so an empty row is never drawn. When that is not known yet, pass the row with `loading`, so
      the tiles under it stay put from the first frame; if the library turns out unreadable, keep the row and let it
      go empty. It folds away and the tiles rise with it instead of jumping. `recentEmpty` says the row is given but
      has nothing to draw, so the entries centre as if there were no row.
    - `onFile` and `onVoice` omitted hide those entries. Photos and camera are required.
    - `onTransitionEnd` fires once per settled open or close, never for the state the panel first renders in, and a
      change overtaken by the next does not report. The host uses it to release a composer offset it held through the
      move.
    - `motion="external"`: the host moves the panel itself through the `ref` (`AttachPanelHandle`), on every frame of
      its own loop, so it can move its composer by the same amount in the same frame. On iOS WebKit the panel's own
      transition starts a frame before a composer's padding does, and the two visibly part. The host writes the
      surface's `transform` from `translateY(100%)` to `translateY(0)` over `SLIDE_MS` on `slideEase`, then calls
      `settle()`. Until then the panel rests where the slide started. A slide never reported is taken as over after
      the slide's length plus 100ms. Instant changes and reduced motion are the panel's own in both modes; the host
      should not animate them.
- `AttachSourceSheet`: the second step of the files entry: file browser or album. Two sources because the system
  pickers split the same way (the photo picker cannot reach a PDF; the document browser does not show the library).
  `notice` is one line for what this device cannot send (an iOS browser, or an app too old to pick videos, takes
  photos only), so the limit is stated up front rather than as a failure after a long silence. Its title is drawn
  in the body, not the sheet header, which sets a larger type and a glass band the design lacks.
- `AudioSendSheet` confirms audio files before sending. Audio is asked about when a photo is not because a
  recording is long and large: a 70MB file picked by mistake is minutes of upload.
- `PickedFileStrip` is the document counterpart of `SelectedPhotoStrip`. A photo or video picked through the files
  picker is a plain file here: the row has no bytes to draw a thumbnail from. Names are cut in the middle so the
  extension stays visible.

## Message content

- `AudioMessageBubble` states: `idle`, `loading` (play pressed, audio not ready), `playing`/`paused` (seek bar,
  clock and speed chip replace the meta line), `sending` (ring with cancel), `failed` (retry and delete chips are the
  host's, see `FailedSendActions`), `broken` (stored but unplayable), `unsupported` (this device cannot play the
  format; a download button lets the file reach another app).
    - `onOpen` is a transparent button under the whole bubble, because the controls are buttons and a slider and a
      button cannot hold another. Text above that layer lets presses through. It is never offered while `sending` or
      `failed`. A long press belongs to the message row, so nothing here stops pointer events.
    - `sendProgress` omitted while sending makes the ring turn instead of fill.
    - On my bubble the button inverts (white disc, navy glyph) because the bubble is already navy.
- `MiniAudioPlayer` has no seek bar: at 48px a bar is too short to aim at. Seeking happens on the detail screen,
  which `onPress` leads to. `subtitle` replaces the built `sender · clock` line.
- `MessageFileCard`: states `ready`, `sending`, `failed`, `broken` (the server reports the upload unusable; kept as a
  dimmed card so what was sent still shows). The download button is always visible: documents are what people come
  to a chat to take away. Its hit area is 44px square, larger than the drawn circle. The name wraps to two lines
  and is cut in the middle, so `report.pdf` and `report.hwp` never both read "report…". `progress` is the download's
  while `downloading` and the upload's while `sending`; omit it for a spinner. An upload with no `name` (older ones
  have none) draws `labels.untitled`.
- `messageFile.ts`: the kind comes from the extension, not the content type, because content type is what old
  uploads and browser picks most often get wrong (HWP arrives untyped on most systems). The extension split follows
  the server: text after the last dot unless it is the first or last character (`.env` and `notes.` are all body).
  Legacy extensions of an accepted family (`doc`, `xls`, `ppt`) still draw as their family. Sizes use binary units
  because the server's ceilings are binary (300 MB is 300 × 1024 × 1024), so a file at the ceiling reads as the
  number a refusal toast names; a non-empty file never reads "0 KB", and a missing or invalid count leaves the size
  out.
- `MessageMediaTiles`: fixed-size tiles because the message carries no dimensions for its media. One tile is square,
  two or three sit in a row, four or more make a 2×2 whose last tile says how many more (`MESSAGE_IMAGE_VISIBLE_MAX`
  visible, `MESSAGE_IMAGE_RENDER_MAX` drawn; exported so a host resolving addresses can skip previews no tile draws).
    - `state`: `ready` with no `preview` is a tile the host is still resolving (an empty tile, not a missing image);
      `sending`/`failed` draw from the local preview; `broken` is a placeholder so the count still matches what was
      sent.
    - A video tile is a still, never played in the feed. `frameUrl` makes a muted `<video>` draw its first frame at
      `#t=0.5` (without the fragment the engines tested drew their default grey; half a second passes the black a
      recording often opens on). Set it only for tiles on screen and only where the host has no image of the frame,
      since each element asks the server on its own. Ignored while `preview` is set.
    - `onImageError` reports a failed preview so the host can fetch a fresh signed address.
    - `progress` omitted draws a spinner instead of a ring. A broken video shows the broken placeholder, not a play
      mark.
    - Previews must be https; http images are blocked as mixed content (see also `LinkPreviewCard`).
- `LinkPreviewCard`: required `title`, since a card without one is not worth showing. It hides a broken thumbnail
  instead of drawing a broken-image glyph, and sends no referrer: the WebView fetches the image straight from the
  publisher, and the request would otherwise carry the app page URL.
- `CodeBlock`: no syntax highlighting by design; a highlighter costs the mobile bundle more than the feature
  returns. Monospace, the tint and horizontal scrolling carry readability, so `overflow-x-auto` and `whitespace-pre`
  are load-bearing (wrapping code is unreadable without colour). It is a `<span class="block">`, not `<pre>`,
  because `MessageBubble` wraps children in a `<span>`. Omit `onCopy` and no copy button renders (the expand dialog
  wants none); clipboard and toast belong to the host. The copy button's pointer handlers are forwarded so the host
  can stop a press from reaching a long-press gesture wrapped around the bubble. Block and inline code read the
  bubble's `data-variant` to pick a light tint on my navy bubble and a dark one elsewhere.
- `ReactionChip`: `mine` is shown by border and count colour, never by tinting the emoji, which must stay legible at
  13px. `formatReactionCount` (`12`, `+99`) is exported so the reactor sheet's tabs and the chips agree. The
  add-reaction chip carries no pressed state because it opens a picker rather than toggling. Tap-to-toggle and
  press-and-hold gestures belong to the host, who knows whether the message is persisted enough to react to.
- `ReadReceipt` `mode`: `count` shows `Read N · Unread M` and collapses to the single all-read label once nobody is
  left ("Read 10" alone made readers work out whether that was everyone); `dm` is a lone unread count that
  disappears once read; `readers` is the line under my last message with up to three faces and a `+N` pill.
- `ThreadSummary`: its timestamp is the last reply's, not the root's, since the root has its own time and "the
  thread moved at 12:06" is the one fact a collapsed thread cannot otherwise show. With a second (unseen) line the
  time moves down beside the reply it dates. Faces come first in the DOM and `flex-row-reverse` moves them for
  mine, so a screen reader hears who before how many.
- `JumpPill`: `mention` is the white pill with orange outline; `latest` the navy one. Position is the host's.
- `SystemMessage` is the pinned entry notice; `SystemNotice` is the in-stream pill (`alert` reddens the text for a
  1:1 losing its only other participant; group streams keep the pill for every notice).
- `FailedSendActions`: retry then delete under the bubble, so a failed send can be handled without knowing a long
  press exists. `align` says which edge the chips hug.
- `MessageRow` `wide` is for content that lays itself out (Block Kit messages) and needs more than the 75% bubble
  cap; ordinary bubbles keep the cap so long lines wrap well short of the opposite edge. Meta is mirrored on my rows
  so the time sits on the outer edge.
- `ProgressRing` fills clockwise from twelve o'clock and is decorative; the host names the progress.
