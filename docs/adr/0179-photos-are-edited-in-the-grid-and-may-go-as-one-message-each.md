# ADR-0179: Photos are edited in the grid and may go as one message each

> Status: Accepted · Decided: 2026-10-07 · Implemented: `feat/photo-edit-before-send`
> · Scope: `apps/web/src/app/features/channels/` (`ChatImageAttach`, `usePhotoPicker`,
> `usePhotoSendGrouping`, `utils/bakePhotoEdit`) · `libs/web-ui-kit` (`PhotoEditor`, `EditedPhotoImage`,
> `photoEdit`, `cropBox`, `PhotoGridSheet`, `SelectedPhotoStrip`) · `libs/app-runtime`
> (`sendImages`'s `separately`) · `libs/config` `ui.photoSendGrouped`
> · Supersedes in part [ADR-0123](./0123-picking-a-photo-sends-it-and-the-shell-decides-how-it-is-picked.md):
> its decision 1, "the pick is the send", for the in-app photo grid only
> · The module docs are [apps/web channels/photo-edit.md](../../apps/web/docs/feature/channels/photo-edit.md),
> [apps/web channels/image-send.md](../../apps/web/docs/feature/channels/image-send.md) and
> [libs/app-runtime data/image-send.md](../../libs/app-runtime/docs/data/image-send.md)

## Context

ADR-0123 made the pick the send: whatever passes the check goes at once, with no tray, caption or
confirmation. That still describes the file inputs, the camera and the app's own picker. The in-app
grid (ADR-0123 decision 3, extended by ADR-0150, ADR-0171 and ADR-0174) is different: it has had a
send button of its own from the start, so a pick there already waits for a press.

Two things were asked for in that grid, both common in the chat apps people compare this one with:

- **Edit a photo before it goes** — crop it, turn it, mirror it. LINE, Telegram, WhatsApp, Signal and
  NAVER WORKS all have crop and rotate in the send flow; most add drawing, text and filters too.
- **Choose whether several photos go as one message.** KakaoTalk's mobile picker has a
  "사진 묶어 보내기" checkbox once several photos are picked, and its PC app keeps the same choice as a
  setting. Telegram Desktop saves its "Group items" box; Telegram Android has a one-time "send
  without grouping". NAVER WORKS always bundles.

What the code had to work with:

- **The grid holds only previews.** They are centre squares of at most about 440 px. The photo itself
  reaches the page only through `ReadPhoto`, one photo at a time, as base64 — each read holds a whole
  photo in page memory, and ten in one answer would take the WebView down.
- **The original is sent at full size on purpose** (ADR-0111): a JPEG's bytes go up as read. Any edit
  therefore means a new encode in the page.
- **The iOS WebKit canvas stops at 16,777,216 px of area.** Past it the 2D context or the encode comes
  back empty, without an error. An iPhone 15 or later shoots 24 MP by default. WebKit also cannot
  encode WebP, and any canvas keeps only a GIF's first frame.
- **The web ships before the app.** Anything native needs an app release, and a fallback for the apps
  already installed.
- **One `sendImages` call was one message.**

## Decision

1. **Only the in-app grid changes.** The file inputs, the camera, the app's own picker and browsers
   keep "the pick is the send", and so does desktop-web. The grid already waited for a press, so it
   gains no step; anywhere else this would have added one.
2. **A web editor, in the kit.** Full-screen and black like the image viewer: a pager over the
   picked items in pick order; ✕, a "2 / 5" count and "완료" above; the picked strip, a
   "자르기·회전" tool and the send button below. The tool has a crop box with corner and edge
   handles, the presets free / original / 1:1 / 4:3 / 3:4 / 16:9 / 9:16, rotate left, flip and reset,
   with cancel and apply. Crop, rotate and flip only. Videos and GIFs are shown and not editable.
   ✕ leaves without the edits made since the editor opened, and the host asks first when there are
   any; "완료" keeps them; the send button sends.
3. **An edit is instructions, not pixels.** A quarter turn, a mirror, a crop normalised to the shown
   frame, and the preset. It is measured against the decoded, upright photo. One function
   (`planPhotoEdit`) turns it into an output size and a transform, which the editor and the strip
   apply as a CSS `matrix()` and the send applies with `setTransform`. An edit that changes nothing is
   dropped. Unpicking a photo drops its edit without asking.
4. **The editor reads the photo when it shows it**, the showing one first, then its neighbours, one
   read at a time, and keeps the bytes for the send. It draws a copy at most 2048 px long.
5. **The edit is drawn at the send**, one photo at a time, and only for photos whose edit changes
   something. Every other photo goes as its original bytes, exactly as before. The output keeps the
   source format where it can (JPEG at 0.9 on white, PNG as PNG, WebP as WebP where the browser can
   encode it, otherwise JPEG) and is scaled down evenly to at most 16,777,216 px of area. A photo
   whose edit cannot be drawn is refused alone, with a notice of its own; its original is not sent in
   its place.
6. **"묶어 보내기", on by default and remembered.** The grid's footer shows the checkbox once two or more
   items are picked. Off, the pick goes as one message per item, in pick order:
   `sendImages(files, { separately: true })` writes every pending row first and then sends the
   messages one after another, each failing and retrying on its own. Nothing else sent in the room
   lands between them: the pick waits for what the room already had on its way, and a send made in the
   room while it goes waits for its last message. A bundled send never waits for another bundled send,
   so a room that never sends one each sends as before. The choice is kept per device in
   `ui.photoSendGrouped` (local lane, `internal`). The cap stays ten per pick either way.

## Consequences

- **A grid send that edits nothing is the same tap, the same bytes and the same message as before.**
  The editor and the checkbox appear only once something is picked, and an unedited photo is never
  decoded or re-encoded.
- **An edited photo is a new file.** It is re-encoded at 0.9 — JPEG, or PNG and WebP kept as
  themselves where the browser can encode them. It loses its EXIF (the date taken and the camera; the
  shell had already removed the location), and a 24 MP photo whose edit keeps more than 16.7 MP
  (turned or mirrored without a crop) goes up at about 16.7 MP, about 17% shorter on each side.
- **The pending row of an edited pick appears later.** The edits are drawn before the send starts,
  one photo at a time, and each is a full decode and encode of the photo. The row then shows the
  edited photos from its first frame.
- **Bytes cross the bridge once, and are held for as long as the pick.** A photo read for the editor
  is not read again at the send. Until the send, the pick's photos stay in page memory — at most ten,
  which the send holds anyway once it starts — and they are let go on unpick, on send and when the
  grid closes.
- **Canvas orientation on WKWebView is unmeasured.** The page relies on an `<img>` drawn upright, which
  `decodeImage` measured in Chrome only. A portrait photo needs checking on an iOS device before this
  is trusted there.
- **A GIF is known only once it is read.** The library's list does not carry a format, so "편집" can be
  live for a pick of GIFs until the editor reads them and says they cannot be edited.
- **One message each costs more round trips.** Each message makes its own four socket requests and no
  upload overlaps another message's; with the socket down, each waits its own ten seconds
  (`waitForConnection`). Ten photos sent apart are ten messages in the feed.
- **A send made during a one-each pick waits for it.** A camera photo or another pick sent into the
  same room while the pick goes out starts once the pick's last message has settled — tens of seconds
  behind ten photos — though its row shows at once. The wait has no ceiling of its own: it relies on
  every step of a run giving up by itself, so a run that never settled would now hold the room's later
  sends, not only its own message.
- **No app release, and no new bridge message.** The grid and `ReadPhoto` already exist in every app
  that shows the grid. desktop-web calls `sendImages` with one argument and is unaffected.
- **The decision record moves.** ADR-0123's decision 1 now speaks for the other pick paths only.

## Alternatives

- **A native editor.** The system crop screens do not fit: iOS offers only
  `UIImagePickerController.allowsEditing`, a square crop of one image, and Android's
  `com.android.camera.action.CROP` is not a public API and behaves differently from device to device.
  A library such as uCrop on Android or TOCropViewController on iOS would give a full crop screen,
  but one native screen per platform, editing one image at a time in a look that is not the viewer's.
  It would also need a new bridge module and its TypeScript wrapper, an app release before anyone could
  use it, and a fallback for the apps already installed. Its one real gain is pixels past the WebKit
  canvas limit; the web editor covers both platforms in one implementation that ships with the page.
- **A crop library on the web (`react-easy-crop`, `cropperjs`).** `react-easy-crop` moves the photo
  under a fixed crop window rather than resizing a box with handles, which is not the interaction
  asked for. `cropperjs` has handles, presets, rotation and flip, but it owns its DOM and its own
  canvas export. Fitting it to the kit's dark full-screen shell, its pager and gestures, and to the
  area cap would take about as much code as the geometry itself. The geometry is two small pure
  modules (`photoEdit.ts`, `cropBox.ts`) with unit tests, and it adds no dependency to the kit.
- **Draw the edit at "적용" instead of at the send.** Every apply would re-encode a whole photo — a
  full decode, a full canvas of memory and an encode for a 24 MP photo — including for edits changed
  again later and photos unpicked before the send. The editor would also hold encoded copies on top of the
  originals. Drawing at the send does the work once, for what is actually sent.
- **Pass the edit into the send's preparation.** The runtime's `prepareChatAttachment` could take a
  transform and apply it while making the upload and its thumbnail. But the pending row is drawn from
  the picked file before preparation runs, so the feed would show the uncropped photo first and then
  swap in the cropped one. It would also carry a grid-only idea into the shared runtime and data layer,
  which desktop-web uses too.
- **Loop `sendImages` in the app, one call per item.** Awaiting each call puts the messages in order,
  but each row is written only when its own call starts, so the rows appear one by one as the earlier
  messages finish. Not awaiting them races the sends, and the server numbers messages in the order
  they arrive. The runtime option writes every row at the press and then sends in order. It also keeps
  "one preparation at a time" inside the hook, where it can hold across messages and retries, and the
  room's order with it: every send passes through the hook, the camera's included, so it is the one
  place that can keep them from landing between a pick's messages.
- **Ask on every send instead of remembering.** Telegram Android asks per send. A person who always
  sends photos apart would then make the same tap every time. Remembering matches KakaoTalk and
  Telegram Desktop. The box is on screen whenever two or more items are picked, so the choice in force
  is always visible before the send.
- **Draw edited photos at full size.** A 24 MP photo would come back blank or not at all from an iOS
  WebKit canvas, so editing one of today's default iPhone photos would fail. Only a native "draw this
  edit" message could avoid that, at the cost of the native alternative above. A fixed long edge such
  as the 4096 px the shell uses for RAW would also fit, but it throws away more than it needs to: a
  4:3 photo at 4096 px is 12.6 MP where the area cap keeps 16.7 MP.
