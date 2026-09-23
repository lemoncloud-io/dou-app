# ADR-0111: The destination decides how a picked image is prepared, and the native picker does not prepare it

> Status: Accepted · Decided: 2026-09-22 · Implemented: `feat/image-resize`
> · Scope: `libs/shared/src/utils/prepareImage.ts` · `libs/shared/src/utils/index.ts`
> · `apps/web/src/app/**` · `apps/desktop-web/src/app/features/profile/**` (call sites)
> Related: [ADR-0049](./0049-feedback-photo-attachment-inline-base64.md) (introduced
> `scaleImageToDataUrl`, retired here; its inline-base64 decision stands) ·
> [ADR-0012](./0012-place-profile-creation.md) (introduced `resizeImageToBase64`, retired here)

## Context

An image attachment is uploaded at whatever size it was picked at, up to the client's 20MB ceiling.
The receiver pays for that even when all they see is a list thumbnail. Two problems sit underneath:

- **Neither existing helper can be reused.** `resizeImageToBase64` and `scaleImageToDataUrl` both
  return a base64 data URL, because both feed a record field. An attachment PUTs raw bytes to S3, so
  a data URL means a 4/3 size penalty, a decode back to bytes, and three copies alive at once. And
  `resizeImageToBase64` center-crops to a square, which is right for an avatar and wrong for a photo.
- **HEIC is rejected.** The upload endpoint accepts png, jpeg, gif and webp and answers anything else
  with a 415. HEIC is the iPhone default.

The native picker looked like a free answer. `react-native-image-picker` already takes `maxWidth`,
`maxHeight` and `quality`, and the bridge payload already declares all three, so the shrink could
have been an options object rather than any code at all.

**It is not free.** Reading 8.2.1's native sources:

|                  | iOS (`ios/ImagePickerManager.mm`)                                                                           | Android (`android/…/Utils.java`)                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Animated GIF     | excluded from the resize — safe                                                                             | **not excluded**. `resizeOrConvertImage` runs on anything `isImageType` accepts, and `getBitmapCompressFormat` does not know gif, so it falls through to JPEG |
| Reported type    | first-byte sniff: `0xFF`→jpg, `0x89`→png, `0x47`→gif, **everything else**→jpg, emitted as `"image/" + type` | from the file extension                                                                                                                                       |
| HEIC             | left alone unless `maxWidth` or `quality < 1` forces a re-encode                                            | converted by default (`convertToJpeg`, quality 92)                                                                                                            |
| EXIF orientation | baked into pixels when resizing                                                                             | never baked; the tag is copied onto the output                                                                                                                |

Two of those rows are disqualifying. **Android destroys animated GIFs** the moment a `maxWidth` is
passed — it decodes to a Bitmap, compresses as JPEG, and still names the result `.gif` and declares
it `image/gif`, so the server is handed bytes that contradict the declaration. And **iOS emits
`image/jpg`**, which is not one of the four accepted types; the same first-byte sniff also labels
HEIC and webp as `jpg` without necessarily having converted either.

EXIF was expected to be the hard part on the web. It is not. A JPEG carrying Orientation=6 was fed
to all three decode routes (Chrome 152): `<img>` via `createObjectURL`, `createImageBitmap` with
default options, and `createImageBitmap` with `imageOrientation: 'from-image'`. **All three applied
it** — the default having followed the 2021 change to its spec.

## Decision

**One function, `prepareImage(file, options)`, and the destination picks the policy.** The shell
keeps calling the picker with no resize options, so the WebView runs the same code the browser does.

The lib had grown two near-identical helpers — `resizeImageToBase64` for avatars and
`scaleImageToDataUrl` for feedback screenshots — and an attachment path would have made three. All
three share a decode–measure–draw–encode core, and that core is exactly where EXIF orientation is
decided, so three copies means three places to get it wrong.

They become one function, and what selects behaviour is **where the image is going**, because the
client has two upload paths whose constraints are opposite:

|              | `'inline'` (base64)                                                                    | `'storage'` (object storage)                                     |
| ------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| what goes up | **always compressed** — base64 costs ~4 bytes per 3, so the encoded size is the budget | **the original**, at full size                                   |
| returns      | a JPEG data URL                                                                        | the original, its dimensions, and a thumbnail                    |
| on failure   | rejects — the caller has nothing to store                                              | returns the original; an upload is not blocked by a preview step |

```ts
prepareImage(file, { to: 'inline', fit: 'cover', maxEdge: 150 }); // avatar
prepareImage(file, { to: 'inline', maxEdge: 1024, quality: 0.6 }); // feedback screenshot
prepareImage(file, { to: 'storage' }); // chat attachment
```

Making the destination the axis is what stops the mistake this design exists to prevent: an inline
caller cannot turn compression off, because there is no option to do it. Correctness is enforced by
the type rather than by each caller remembering a rule.

**"The original" means "not resized", not "not touched".** HEIC is still converted to JPEG and
renamed, because the endpoint answers anything outside png/jpeg/gif/webp with a 415 — that is
correctness, not a size budget. Passing `maxEdge` downscales as well, but it is opt-in.

**The thumbnail is why the original does not need shrinking.** The reason to shrink an attachment was
that a list downloads what was uploaded; a small copy alongside solves that without spending the
quality the sender chose, and it gives the reader dimensions to reserve layout with before the bytes
land. An animated GIF gets one too — a first frame is exactly what a list row wants, and the rule
against canvasing a GIF protects the copy the user is sending, not a preview of it.

`fit` separates a square center-crop (which upscales, because an exact square is the point) from a
frame-preserving fit (which never upscales). The return type follows `to` through a conditional
type, so an `'inline'` caller gets `Promise<string>` and never narrows a union.

`'storage'` returns `File`s, not `Blob`s, because converting a format changes the name and the
`contentType`, and both are declared to the upload endpoint and signed. A caller handed only bytes
would have to re-derive the name, and that is where a declaration and its bytes drift apart.

It decodes through `<img>`, not `createImageBitmap`. All three routes measured the same, so the
remaining question was which behaviour has been settled longest, and that is `<img>` — EXIF has
applied there since `image-orientation: from-image` became the CSS initial value. Choosing it
removes the support check and the "don't shrink on this browser" fallback that check would need.

**The thumbnail defaults to 512px at quality 0.7**, well under the 200KB the storage side budgets for
that slot while staying legible in a chat bubble. It is a starting point rather than a measured
optimum: the right number depends on whether the thumbnail backs only list rows or the bubble preview
too, and it is one option away from changing.

On `'storage'` the original comes back **as the same object** whenever nothing had to be done to it —
no `maxEdge`, an accepted format, an animated GIF, an undecodable source, a missing 2D context, or a
re-encode that grew the file without changing its format. `===` therefore answers "were these bytes
altered", which the upload path needs, because it has to hash what it actually sends.

**HEIC is converted only where the browser can decode it.** No wasm decoder is added: it would be
hundreds of KB, and the devices that produce HEIC run a WebView that already decodes it. A `.heic`
dragged into desktop Chrome comes back untouched and is refused upstream on format.

**The avatar behaviour is preserved exactly, not redesigned.** Seven call sites still get a 150px
square JPEG data URL that rejects on failure, including the upscale of a source smaller than 150px;
what changed is that they say so in options instead of relying on a function name. The migration is
mechanical and covered: the eight call sites all had suites already, and the unified function's own
suite grew from 15 cases to 24 by adding the `'dataUrl'` and `'cover'` paths, which had none.

## Alternatives

**Pass `maxWidth`/`quality` to the picker.** Free in effort and already wired through the bridge
payload, but it breaks animated GIFs on Android and declares `image/jpg` on iOS. Both are silent:
the upload succeeds or fails far from the picker, and neither shows up in a test.

**Shrink natively and keep the web path for the browser only.** Two implementations whose EXIF
handling already differs — iOS bakes orientation into pixels, Android copies the tag — for one
behaviour. The difference would surface as photos upright on one platform and not the other. The
picker also produces no thumbnail, so the storage path would still need this code.

**Shrink the attachment original instead of adding a thumbnail.** Simpler, and it was the first
version of this decision. It spends quality the sender chose and cannot be undone, and it only moves
the list-download cost rather than removing it — a list still fetches a full 1600px image per row.

**`createImageBitmap` with an `imageOrientation` support check.** The original plan, including a
branch that skipped shrinking where support was missing. The measurement removed the reason for it;
a branch that never runs is a branch that is never right.

**Keep three functions and share only an internal helper.** Less disruptive — no call site would
have moved — but it leaves three names for one operation, and a fourth would arrive with thumbnails.
The names also hid the choice that matters: `resizeImageToBase64` says nothing about cropping, which
is the thing that silently loses data on a screenshot.

**Split it by return type (`output: 'dataUrl' | 'file'`) rather than by destination.** The shape this
decision passed through before the current one. It reads as a technical detail, and it lets a caller
assemble an inline upload with compression turned off — the one combination that must not be
reachable. The destination is the real axis; the return type follows from it.

**Convert HEIC with a wasm decoder.** Buys the desktop-Chrome case at the cost of a large bundle
loaded by everyone, for a format that arrives from phones whose WebView decodes it natively.

## Consequences

Photos picked on the web and in the WebView keep their full resolution, arrive with a small copy for
lists, and carry dimensions so a reader can reserve layout before the bytes land. HEIC becomes JPEG
wherever it can be decoded. An EXIF portrait stays portrait: measured end to end in Chrome 152,
3024×4032 in, orientation preserved through the canvas.

**Whoever wires this in must shrink before hashing.** The sha256 travels in the signature and S3
verifies it at PUT time, so hashing the pre-shrink bytes fails at upload with a 403 and passes every
test. Shrinking also has to come before the size check, or a photo that would fit after shrinking is
rejected before it gets the chance.

**Three of the five skip cases mean the original is uploaded unshrunk.** The size ceiling stays load
bearing; shrinking is not a substitute for it.

**Every image prepared in the client now runs through one function**, so a change to its decode path
reaches avatars, feedback screenshots and attachments at once. That is the point, and it is also the
risk: it is no longer possible to alter the attachment path alone.

**An attachment now costs two uploads instead of one**, and the storage side has to hold a dependent
object under the parent's id. That contract is still being settled upstream, so the thumbnail's byte
cap, and whether it may arrive after the original, are not fixed here.

**The picker still accepts resize options that nothing passes.** The bridge payload declares
`maxWidth`, `maxHeight` and `quality`, and `useDeviceHandler` calls the picker without them. That is
the state this decision relies on, not an oversight to tidy: passing them is what breaks GIFs on
Android. A future change that starts forwarding them needs to exclude gif first.

Only the web path is measured. The behaviour was verified in Chrome 152 and in jsdom unit tests
(15, including a mutation check that the gif guard and the format clause each fail a test when
removed). A real iPhone has not confirmed that a camera HEIC survives the round trip, and no
end-to-end upload has confirmed the S3 checksum, because the upload path does not exist yet.
