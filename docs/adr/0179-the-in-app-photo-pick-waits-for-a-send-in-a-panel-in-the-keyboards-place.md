# ADR-0179: The in-app photo pick waits for a send in a panel in the keyboard's place, and can be edited, captioned and sent one message each

> Status: Accepted · Decided: 2026-10-07 (the editor, one message each), 2026-10-08 (the attach
> panel, the caption, the pick waiting above the composer, the keyboard handover, one frame loop for
> the panel's slides) · Implemented: `feat/photo-edit-before-send` · Scope:
> `apps/web/src/app/features/channels/` (`ChatImageAttach`, `usePhotoPicker`, `usePhotoSendGrouping`,
> `useKeyboardMemory`, `useAttachPanelSlot`, `utils/slotSlide`, `utils/bakePhotoEdit`,
> `ChannelRoomPage`, `ThreadPage`) · `apps/web/src/app/ui/hooks/useChromeInsets`
> · `libs/web-ui-kit` (`PhotoEditor`, `EditedPhotoImage`, `photoEdit`, `cropBox`, `PhotoGridSheet`,
> `SelectedPhotoStrip`, `AttachPanel`, `RecentPhotoStrip`, `MessageInput`) · `libs/app-runtime`
> (`sendImages`'s `separately` and `content`) · `libs/data` (`createPendingImageChat`'s `content`)
> · `libs/config` `ui.photoSendGrouped`
> · Supersedes in part [ADR-0123](./0123-picking-a-photo-sends-it-and-the-shell-decides-how-it-is-picked.md):
> its decision 1, "the pick is the send", for the in-app pick only — the photo grid and the attach
> panel's recent row
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

Then, in the same round, the attach menu itself. It was a modal bottom sheet over the composer: the
page dimmed, the composer hidden behind it, and its recent-photos strip only a way into the grid — a
tap opened the grid with that photo picked. Asked for instead: the menu should come up under the
message box the way the keyboard does, and ticking a photo in it should light the composer's send
button; and the grid's footer should slide in when the first photo is picked rather than appear. That
put a picked photo and typed text side by side under one send button for the first time, so what the
button does with the text had to be decided too. And typing that text means tapping the field, which
closes the panel as the keyboard takes its place — so where the pick is, and what the button does,
while the field has the focus needed deciding as well. Last, how the two trade places: the keyboard
and the panel were to read as one surface, as they do in KakaoTalk, with the composer never jumping
when one replaces the other.

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
- **One `sendImages` call was one message**, and a photo message carried no text from mobile, though
  the message itself can: both the mobile and the desktop feed draw a message with text and uploads.
- **The WebView does not shrink for the keyboard.** The shell injects the keyboard's height as
  `--keyboard-height` and fires no event for it; the composer pads itself up by it. It reports from
  the keyboard's own events, at different moments: iOS as the keyboard starts to slide, already with
  its final height, Android only once the slide has finished, and a browser never.

## Decision

1. **Only the in-app pick changes** — the grid, and the attach panel's recent row (decisions 7 and 8). The
   file inputs, the camera, the app's own picker and browsers keep "the pick is the send", and so does
   desktop-web. The grid already waited for a press, so it gains no step; anywhere else this would have
   added one.
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
7. **The attach menu becomes a panel in the keyboard's place.** No sheet and no dimming: the panel lies
   under the composer, where the keyboard would be. It is as tall as the last keyboard seen on the page
   (306 px plus the safe area before any), so trading one for the other does not move the composer.
   The + becomes ×. Opening it drops the keyboard; focusing the field gives the place back to the
   keyboard (decision 12 says how the two trade places). × and Escape — Android back, delivered as Escape — dismiss
   it; it is a non-modal dialog marked open, so the app's back handler reaches it, and it answers only
   while nothing is open above it. The grid, the camera and files open from it as they did from the menu.
8. **The recent row picks, into the grid's list.** The row offers the newest 30 items in a sideways
   scroll; a tap picks or unpicks in place, with the grid's dimming and order badge, under the same cap.
   The row and the grid are one pick: "see all" opens the grid on it, and closing the grid goes back to
   the panel with the pick and its edits. While anything is picked, the composer's send button is live
   with an empty field and sends the pick, by the grouping choice and with its edits, and closes the
   panel if it is open. A grid send closes the panel too. × and Escape let the pick go; focusing the
   field keeps it, so a caption can be typed after picking, and the pick stays on screen above the
   field (decision 11). In the app the row is drawn from the panel's first frame: while the shell has
   not yet said whether it has a library at all, the row stands in skeleton tiles at its full height,
   so the panel's entries under it are where they will stay; told there is none, it closes on the
   slide's timing and the entries rise with it. A browser, which never has one, never draws it.
9. **What is typed goes in the photo message, as its caption.** When the composer's send button sends
   the pick, the text in the field becomes the photo message's own text (`sendImages`'s `content`),
   and the field is cleared. With one message each, only the first carries it, so it is said once. The
   grid's and the editor's "N장 보내기" send the photos alone and leave the text in the field: they are
   not the composer's button, and nothing on them says the text would go. A caption whose pick ended up
   with nothing that passed the check goes back into the field.
10. **The grid's footer slides.** It rises from below when the first item is picked and goes back down
    when the last is unpicked, on the panel's timing (300 ms, the viewer's curve), at once under reduced
    motion.
11. **The pick waits above the composer.** Whenever some of the pick is out of sight — the panel is
    closed, or it is open with a pick its recent row does not hold, one made in the grid past the
    newest 30 — the whole pick shows directly above the composer's field as a row of small thumbnails
    (the kit's `SelectedPhotoStrip` at its compact size), and the send button stays the pick's. So pick → type →
    send is one message with its caption, whether the panel is open at the press or not. × on a
    thumbnail unpicks it, keeping the keyboard up; a tap opens the editor at it, with no grid under it.
    The row is part of the composer's bar, so the message list clears it the way it clears the field,
    and it carries a soft surface of its own, since the bar has none and the list scrolls behind it.
    Of the ways the panel closes, only its × and back let the pick go; leaving the room drops it too.
    The row opens from nothing as it fills and folds away as it empties, on the panel's timing, so the
    composer grows and shrinks in one movement rather than by a row at a time.
12. **The keyboard and the panel hand the place over as one surface.** Neither moves the composer
    when it replaces the other. + with the keyboard up puts the panel in place at once, behind the
    keyboard and at its height, and the keyboard slides away to reveal it; in the app a focused field
    counts as a keyboard up, since Android reports one only once it has risen. Focusing the field
    leaves the panel in place while the keyboard rises over it and removes it at once 300 ms after the
    keyboard's height first arrives — the rise on iOS, a margin on Android. With no height after
    800 ms (a hardware or floating keyboard), and at once in a browser, the panel slides down instead.
    Where there is no keyboard to trade with — +, ×, back, and every other close — the panel slides
    (300 ms, the viewer's curve) and the composer moves with it on the same frames: one
    `requestAnimationFrame` loop works out one position per frame and writes the panel's translate and
    the composer's offset from it in the same call. Neither has a transition of its own, and the
    kit's panel is moved by its host (`motion="external"`). A slide asked for mid-slide turns around
    from where the panel has got to. The composer pads by the larger of the keyboard and the panel
    throughout; the keyboard's own changes reach it through `--keyboard-height`, at once, as before,
    and never go through the loop. The message list, which clears the composer by its measured
    height, follows a slide in the frame the composer moves, its padding written directly rather than
    rendered, and the page renders once as the slide stops.

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
- **Bytes cross the bridge once while the grid is open.** A photo read for the editor is not read
  again at a send from the grid. Until then the pick's photos stay in page memory — at most ten, which
  the send holds anyway once it starts. Closing the grid lets the bytes go and keeps the pick, its
  edits and the editor's smaller copies: the pick may now wait above the composer for as long as a
  caption takes to type. A send from the composer reads the photos again, edited ones included.
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
- **A photo message from mobile can carry text.** It is one message, numbered once, with one read
  marker and one set of reactions, and a retry sends the text with the photos again. Desktop-web still
  sends its tray's text as a message of its own before the pictures, so the same words and photos land
  as one message from a phone and two from a desktop.
- **A pick can outlive the panel, in sight.** Focusing the field closes the panel and keeps the pick,
  and the composer grows by the row of thumbnails above its field (about 70 px) until the pick is sent
  or let go. While anything is picked, every press of the send button sends it: a text meant as a
  message of its own has to wait until the photos are sent or removed. An editor opened from that row
  reads photos just as the grid's does, and lets their bytes go as it closes, so a send from the
  composer reads them again.
- **The handover leans on when the shell reports the keyboard.** The panel stays in place for 300 ms
  past the first report. An iOS keyboard that took longer than that to rise would leave the panel's
  last strip uncovered as it goes; one that never reports (hardware, floating) leaves the panel up for
  800 ms before it slides away. A + in the app with the field focused counts as a keyboard up even
  while an Android keyboard is still rising, so the panel is there a moment before the keyboard meets
  it. A keyboard of another height than the panel — the first one on a page that guessed 306 px, or a
  switch of keyboard — still moves the composer by the difference, at once, as any keyboard change
  does. A panel opened from a browser, where no keyboard height is injected, is the design's 306 px.
- **A slide is JavaScript on the main thread, every frame.** The panel's transform no longer runs on
  the compositor by itself: a frame the main thread misses is a frame both the panel and the composer
  miss, together, rather than one where they part. Each frame writes two styles and lays out the
  composer and the list, and renders nothing in React — before, the room re-rendered on each of the
  slide's frames (about 19 of them), because the list's inset is the composer's measured height. The
  composer's resizes go straight to the list for the slide's length (`useChromeInsets`'
  `followFooter`), so something else that resizes the composer during a slide — the picked row
  folding as × clears the pick — is followed the same way and rendered once at the end.
- **The panel's first opening on a page draws a row that may not stay.** In an app built before the
  photo bridge, and where access is denied or the library is empty, the skeleton row closes again a
  moment after the panel has risen, instead of never being there; in an app with photos, the entries
  under it no longer jump down by the row's height when the photos come.
- **The decision record moves.** ADR-0123's decision 1 now speaks for the other pick paths only.

## Alternatives

- **Text as a message of its own, before the photos, as desktop-web does.** It keeps every message one
  kind and needs nothing from the runtime or the data layer. But on a phone the text and the photos
  were picked and pressed together, under one button, and two messages for one press read as two
  things said — with two read markers, two sets of reactions, and the risk that the text lands and the
  photos fail. The two sends also number apart: the text goes at the press, the photos only once their
  uploads are done, so a message sent meanwhile lands between them. Putting the text in the photo
  message makes it one message, the shape Telegram's and WhatsApp's photo captions take, and the feeds
  already draw it.
- **Leave the text in the field; the button sends the photos only.** Simplest, and the field keeps
  whatever the person was writing. But the button then means "photos" or "text" depending on what is
  picked, a person who typed a line for the photos has to press twice, and between the presses a
  message from someone else can land between the photos and the words about them.
- **Keep the menu a sheet, with a send button of its own.** The sheet covers the composer, so the
  text and the photos could not be seen together, and a second send button beside the composer's is
  what the design removed. The panel in the keyboard's place keeps the composer on screen and gives
  it the one button.
- **Keep the pick out of sight while the panel is closed, and send it only from the open panel.** This
  ADR's first answer: a pick waited, unseen, until the panel was opened again, and the send button
  ignored it meanwhile, so photos never went from a panel that was not on screen. But "pick, then
  type, then send" — the natural order — sent the text as a message of its own and left the photos
  picked where nobody could see them; a caption only went with them if it was typed first or the panel
  was reopened before the press. Showing the pick above the field keeps the guarantee that it is on
  screen when it is sent, without making the person reopen anything.
- **Keep the send button live for a pick out of sight.** One press would then send photos the person
  could no longer see, with text they may have meant on its own. Rejected for the same reason the first
  answer gave; the row above the field removes the "out of sight" rather than the send.
- **Let the pick go whenever the panel closes.** No pick would ever wait at all. But focusing the field
  is how a caption gets typed, and it closes the panel: a pick lost to that tap would make "pick, then
  type" impossible. × and back are the explicit dismissals, so they let it go.
- **Move the composer at once, and slide only the panel.** The panel's first version: the composer
  took its new place in one step, as it does for the keyboard, while the panel took 300 ms. The two
  visibly came apart — a gap under the composer while the panel rose, the composer dropping onto a
  panel still on its way down.
- **Close the panel at the focus, and hold its room for a fixed time.** The first answer to the
  keyboard taking over: the panel slid away at once and the composer kept its room until the
  keyboard's height came, or for 600 ms. The composer stayed put, but for that moment neither surface
  was whole — the panel going down while the keyboard came up, the page showing between them — and
  one fixed wait could not fit two platforms that report at different moments. Keeping the panel in
  place until the keyboard covers it removes the gap instead of waiting it out.
- **Remove the panel as soon as the keyboard's height arrives.** Right on Android, which reports once
  the keyboard is up. iOS reports as the keyboard starts to rise, so the panel would vanish under a
  keyboard still on its way and leave the same gap. 300 ms after the report fits both.
- **Animate the keyboard's changes as well.** One rule for every change of the composer's offset. But
  the shell reports the keyboard once per move — iOS at the start with the final height, Android at
  the end — so a transition would trail the iOS keyboard on a curve that is not its own, and on Android
  start only after the keyboard had arrived. The composer keeps tracking the keyboard as it always
  has, and only the panel's own slides move it gradually.
- **Two transitions on the same timing: the panel's transform and the composer's padding.** This
  decision's first form, and the one that looked right in desktop Chrome. On the iOS simulator a
  recording showed the panel already 246 pt down in the first moving frame of a close, with the
  composer not yet moved: a transform transition is handed to the compositor and starts at once, a
  padding transition is laid out on the main thread and starts a frame later. Matching duration and
  curve cannot fix a difference in where each one runs.
- **Move the composer with a transform as well.** Both would then run on the compositor and start
  together. But the list clears the composer by its measured height, which a transform does not
  change, so the list would have to move by a transform of its own, and the composer's padding would
  still have to land on its final value at the end, in one jump of the layout under a composer that
  had already arrived. One loop writing what each surface already uses keeps a single offset rule for
  the keyboard and the panel alike.
- **Let the list follow the composer by rendering the page, as it does for the keyboard.** No new
  mechanism, but on every frame of a slide: a render of the whole room for each frame, which then
  lands a frame after the composer has moved. The keyboard moves the composer once per move, so a
  render there costs one; a slide costs one per frame.
- **Draw the recent row only once the library has answered.** No row that may close again, but on
  the first opening on a page the entries under it were pushed down by its height as the answer came —
  about 170 ms after the panel rose on an iOS simulator, almost three seconds on an Android emulator.
- **Keep the pick above the composer only while the panel is closed.** The open panel's recent row
  was taken to show the pick. But it shows the newest 30 only, so a photo picked in the grid past
  them went unseen while the panel was open, and the composer's send button sent it. Showing only the
  picks the row cannot was considered too: the pick's order, and its edits, are the whole pick's, and
  half of it in each place would read as two picks.

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
