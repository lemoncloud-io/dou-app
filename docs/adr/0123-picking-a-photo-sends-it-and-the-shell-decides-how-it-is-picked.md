# ADR-0123: picking a photo sends it, and the shell decides how it is picked

> Status: Accepted (decision 1 is Superseded for the in-app pick — the photo grid and the attach panel's recent row — by [ADR-0179](./0179-the-in-app-photo-pick-waits-for-a-send-in-a-panel-in-the-keyboards-place.md): its picks can be edited, sent as one message each and given a caption before a send button is pressed) · Decided: 2026-09-29
> Scope: `apps/web/src/app/features/channels/components/{ChatImageAttach,MessageImages,ChannelMessageRow}.tsx` ·
> `apps/web/src/app/features/channels/hooks/usePhotoPicker.ts` · `apps/web/src/app/bridge/photoLibrary.ts` ·
> `apps/web/src/app/features/channels/pages/{ChannelRoomPage,ThreadPage}.tsx` ·
> `libs/data/src/domain/chatImages.ts` · `libs/app-messages/src/types/model/photo-library.ts` ·
> `libs/web-ui-kit/src/composites/{chat,media}/**`
> Related: [ADR-0121 (image send over a PUT port)](./0121-an-image-send-runs-in-the-data-layer-over-a-put-port.md)
> (the send this screen calls) · [ADR-0118 (native file transfer)](./0118-native-file-transfer-replaces-the-chunked-upload-module.md)

## Context

The image send existed (ADR-0121) but nothing on screen called it. The mobile chat composer was a
text field and a send button, and a message carrying images drew as an empty bubble. Putting a picker
in front of the send raised questions the design did not answer by itself:

- **What happens between picking and sending.** A tray above the input, a caption, a confirmation —
  or none of them.
- **How photos are picked in each shell.** A browser can only use a file input. The app can list the
  photo library, but only a build that has a handler for it — and the web ships before the app. The
  app already had an `OpenPhotoLibrary` message, but the installed builds ignore the options the page
  sends (a single photo, no bytes) and answer with a `ph://` or `content://` path the WebView cannot
  read.
- **How the camera is opened.** A native camera message has the same problem as the library one.
- **How an image message is drawn.** The server embeds each upload in the message as an id, a status
  and two signed addresses. It carries no dimensions.
- **How a failed image message is retried.** The existing retry deletes the row and resends its
  `content`, which for an image message is empty.

## Decision

1. **The pick is the send.** Whatever passes the check is handed to the send at once. There is no
   tray, no caption and no confirmation, and the pending message in the feed is the progress.
2. **One check, before anything is sent.** `judgeChatImages` in `libs/data` applies the four formats
   the server takes, 20 MB a file (the page holds a whole photo in memory while it prepares it), a
   photo picked twice, and the per-message limit. The limit is passed in, not imported, so the domain
   module does not depend on the send sequence that owns `IMAGE_MESSAGE_SLOT_MAX`. The file inputs and
   the grid both go through it.
3. **The shell decides how photos are picked, and the page learns which.** An app with the
   photo-library bridge (`ListPhotoAlbums`, `ListPhotos`, `ReadPhoto`, `ManagePhotoSelection`) gets
   recent photos in the attach menu and an in-app grid. Everything else — a browser, or an app built
   before the bridge — uses the page's own file input. The page learns which by asking: opening the
   menu requests the newest photos, and one `NOT_FOUND` settles it for the page. A timeout is not
   learned from.
4. **An older app uses the file input, not its own photo message.** The WebView hands a file input to
   the OS chooser and returns real bytes. The profile and channel photo fields already rely on it
   inside the app. The older `OpenPhotoLibrary` handler cannot be fixed without shipping the app, and
   a fix that ships with the app can ship the grid instead.
5. **The camera is a capturing file input in every shell.** The camera entry has its own input with
   `capture`, so it opens the camera directly. The photos and files entries share one without it, so
   the album stays reachable. Nothing is needed from the app.
6. **Image tiles are fixed-size.** With no dimensions in the message there is nothing to reserve a
   ratio from. Without text the images take the bubble's place. With text they sit under it. An upload
   the server marks failed keeps its tile as a placeholder, so the count still matches what was sent.
7. **A failed image message retries through the image send, decided at the tap.** The files for a
   retry are held in a page-level map that is not React state, and the send releases them for a retry
   only after it has marked the row failed. A render-time check could therefore hide the retry button
   on the row that just failed. The tap asks instead, and a row whose files are gone answers with a
   notice to delete it.

## Alternatives

- **A tray above the input with a send button.** It is the common pattern, and it lets a user add a
  caption. It was not taken because the product asked for an immediate send, and a tray adds a state
  the composer would have to lock, clear and restore across channel switches.
- **Reading the handshake's `supportedWebMessages` to detect the grid.** It arrives asynchronously and
  would race the first open of the menu. It is also built from the app's compiled message map, not
  from the handlers actually registered, so it can claim support that is not there. `nativeUploadSource`
  and `nativeBadgeReader` rejected it for the same reasons.
- **Asking the older app's `OpenPhotoLibrary` for base64.** The installed builds drop the request's
  options, so the answer is one photo with no bytes. Nothing on the web side can change that.
- **A native camera message.** It would need the same app update as the grid and would give the same
  result as a capturing input. The one thing it adds is an in-app prompt when camera access is denied.
- **Hiding retry on rows that cannot be retried.** This needed the render-time check that item 7
  explains. Making the file map React state would have meant changing the send's hook for a message
  that is rare: a row left behind by a reload.

## Consequences

- **The grid is inert until the app ships its handlers.** Every installed app answers `NOT_FOUND`
  today, so every shell uses the file input. The web needs no change on the day the app ships.
- **The in-app handlers are the next piece of work.** They need a library to list photos and a way to
  make small previews on Android. Neither is in the app yet.
- **Previews travel as base64.** A page of 60 small JPEGs is a few hundred KB over the bridge. The
  WebView cannot load a device path, so there is no cheaper form.
- **A grid send shows its pending row a moment late.** The picked photos are read one at a time
  before the send starts. A file-input send shows it at once.
- **Camera access denial is the OS's prompt, not ours.** A capturing input gets no answer that says
  why nothing came back, so the in-app "no camera access" dialog is not shown. Photo access denial is
  known from the bridge and does show the settings prompt.
- **`apps/desktop-web` still does not read `upload$$`.** An image sent from mobile shows there as an
  empty message until its reader is changed.
