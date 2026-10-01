# ADR-0152: A download lands in a folder the shell owns, and only its files leave the app

> Status: Accepted · Decided: 2026-09-30
> · Scope: `libs/app-messages/src/types/model/{file-transfer,media-export}.ts` ·
> `apps/mobile/android/app/src/main/java/io/chatic/dou/{transfer,service,module,media}/` ·
> `apps/mobile/ios/Bridges/{Transfer,MediaExport}/` · `apps/mobile/src/app/webview/hooks/mediaExportHandlers.ts`
> · The module docs are [apps/mobile file-transfer.md](../../apps/mobile/docs/native/file-transfer.md) and
> [apps/mobile media-export.md](../../apps/mobile/docs/native/media-export.md)

## Context

A chat photo cannot be saved on mobile. The web cannot do it alone: WKWebView ignores `<a download>`,
and the web can hold an image's bytes only when the storage answers with CORS headers, which the
production bucket is not known to send — without them the page draws the signed address straight
into `<img>` and never has the bytes. The shell can fetch the address directly; CORS does not apply
to it.

The native file transfer ([ADR-0118](./0118-native-file-transfer-replaces-the-chunked-upload-module.md)) was made direction-neutral for this: `direction: 'download'` was
in the contract from the start and refused with `INVALID`. What it left open is where a download
writes, and how the file gets from there to the photo library or the share sheet. Both are
questions of trust. The web bundle is loaded from the network, and whatever a message lets it name,
a compromised or mistaken page can name too.

## Decision

**The shell decides where a download goes, and hands out only what it wrote there.**

- **Downloads land in `<cache>/transfer-download/<folder>/`.** A download request names no path — one
  that carries `file.uri` is `INVALID` — only a file name hint. `<folder>` is the SHA-256 of the
  transfer id, so an id cannot climb out of the folder either. The name hint loses its path segments,
  control characters and characters storage refuses, and its extension is replaced by the one the
  bytes show when they are a known image.
- **Only a 2xx becomes a file.** The body is written as `<name>.part` and renamed when complete; any
  other status is `responded` with its storage error code and nothing on disk. A 403 XML body kept
  under an image name would go straight into the photo library.
- **The terminal event returns the file** (`file: { uri, size, contentType }`), held until
  acknowledged like the rest of the result.
- **Two new messages take the file onward: `SaveToPhotoLibrary` and `ShareFile`.** Both take a local
  URI and nothing else — never a URL. Each accepts a URI only when its normalised, link-resolved real
  path is a committed file inside the download folder. On Android the share provider's one path rule
  is the same folder, a second line behind the first.
- **The bytes decide the type.** `Content-Type` is what the uploader declared; the first bytes are
  matched against PNG, JPEG, GIF and WebP, and anything else is `UNSUPPORTED_TYPE`.
- **The request asks for the body unencoded** (`Accept-Encoding: identity`). Both HTTP stacks ask for
  gzip by default and inflate the reply themselves, and then the bytes and their length would differ
  from the stored object's.
- **Downloads stay off the system surfaces that stand in for the page.** They never start the iOS
  continued-processing task and are never counted in a failure notification; the user is waiting on
  screen, and the page reports progress and failure itself. Android still runs them in the
  foreground service, whose notification therefore shows briefly.
- **The shell cleans up.** A saved file is deleted at once. A shared one is kept, because the
  receiving app may read it after the sheet closes; every download start sweeps folders not changed
  for 24 hours, except those of running downloads.

## Consequences

- **The download direction is not image-specific.** A later consumer — a file attachment, say —
  starts a download and gets a file back without a new message. Only the export side is limited to
  images.
- **The web cannot export arbitrary files, even by mistake.** The cost is that it cannot export
  anything it did not download through the shell in the same install, which is the point.
- **A short download flashes the Android transfer notification for about a second.** Android 12 and
  later delay a foreground-service notification, but not one with an action button, and this one has
  Cancel. Hiding it would mean either a second transfer path that skips the service, or a delayed
  button that only hides the first of several downloads.
- **The OS may clear the cache between download and save.** The save then fails with `SOURCE`, and
  the web downloads again. A shared file can disappear after a day, which is longer than any share
  sheet stays open.
- **iOS needs `NSPhotoLibraryAddUsageDescription` even for sharing**, because the sheet's "Save Image"
  runs in this process. Without it iOS 18 and 26 ask for full library access instead of add-only.
- **iOS keeps an empty `<name>.part` in the folder while a download runs.** The background task may
  carry only the transfer id, so this marker is how a relaunched process still names the file.

## Alternatives

- **The web fetches the bytes and hands them over.** Rejected: it needs CORS on the production
  bucket, which is not established, and it would push every image through the bridge as base64.
- **One message that takes the URL and saves.** Rejected: it hides the download inside one consumer,
  puts a signed URL in a second message, and leaves the next consumer to build its own download.
- **The web names the target file, as it names an upload's source.** Rejected: a page that can name
  a path can overwrite the app's database or settings.
- **The transfer id as the folder name.** Rejected: the id comes from the web, and `../..` is a valid
  string.
- **`react-native-share` and `@react-native-camera-roll/camera-roll`.** Rejected: two new
  dependencies for a few dozen lines each, with known faults on exactly these paths — add-only saves
  reported as failures, and a null media-store insert carried on into a crash. React Native's own
  `Share` sends only text on Android.
- **A default `URLSession` for foreground downloads.** Rejected: measured as fast as the background
  session in the foreground, and it would give downloads a second code path and no background
  completion.
- **Trusting `Content-Type`, or the file name's extension.** Rejected: both come from whoever
  uploaded the file.
