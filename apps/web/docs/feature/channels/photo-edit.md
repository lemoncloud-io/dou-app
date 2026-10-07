# photo edit — cropping, turning and mirroring picked photos before the send

> Status: wired into the in-app photo grid. Canonical code:
> [`components/ChatImageAttach.tsx`](../../../src/app/features/channels/components/ChatImageAttach.tsx)
> (when the editor opens, what ✕, "완료" and the send do),
> [`hooks/usePhotoPicker.ts`](../../../src/app/features/channels/hooks/usePhotoPicker.ts) (reading for
> the editor, the edits, drawing them at the send) and
> [`utils/bakePhotoEdit.ts`](../../../src/app/features/channels/utils/bakePhotoEdit.ts) (the canvas).
> The editor screen, the edited thumbnail and the geometry are the kit's — `PhotoEditor`,
> `EditedPhotoImage` and `photoEdit.ts` in `libs/web-ui-kit/src/composites/media/`. How the grid
> lists, picks and sends is in [image-send.md](./image-send.md).

Only the in-app grid (`PhotoGridSheet`, in an app with the photo-library bridge) edits. The page's
file inputs, the camera and the app's own picker still send what was picked at once, and so does a
browser; desktop-web has its own tray and is unchanged. The grid is the one place a pick already
waited for a send button, so editing fits there without adding a step anywhere else.

## Opening it

- **"편집"** in the grid's footer opens the editor at the first picked item that can be edited.
- **A tap on a thumbnail** in the picked strip opens it at that item.

"편집" is greyed when nothing picked can be edited — only videos, or GIFs already read (below). Both
are shut while the grid is reading the pick for a send.

## The screen

Full-screen and black, like the image viewer: a pager over the picked items, in pick order — the
videos and GIFs among them too, so the count and the order are the pick's.

- **Header:** ✕ on the left, "2 / 5" in the middle, "완료" on the right.
- **Footer:** a strip of the picked items (the showing one ringed, a tap jumps to it), then a toolbar
  with "자르기·회전" on the left and the send button ("N장 보내기") on the right.

The count and the strip show only when two or more items are picked, as in the image viewer.

What the three exits do:

| Exit                                                 | What happens                                                                                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ✕ (and Escape or Android back outside the crop tool) | Back to the grid without the edits made since the editor opened. When there are any, a dialog asks first — "편집을 취소할까요?", "계속 편집" / "편집 취소"                     |
| "완료"                                               | Back to the grid with the edits kept                                                                                                                                           |
| The send button                                      | The editor closes onto the grid and the grid's own send runs, as one message or one each by the grid's checkbox ([image-send.md](./image-send.md#picking--usechatimageattach)) |

"Made since the editor opened" is a comparison of the edits then and now (`editsDiffer`), so an edit
made and then undone leaves nothing to ask about. Cancelling puts back the edits the editor opened
with; earlier ones survive.

**"자르기·회전"** works on one photo, and hides the pager, the strip and the send button meanwhile: a crop
box with four corner and four edge handles, dragged inside to move it, the photo dimmed outside it, a
rule-of-thirds grid; the presets "자유" · "원본" · 1:1 · 4:3 · 3:4 · 16:9 · 9:16 (the ratios are not
translated — they read the same everywhere); "왼쪽으로 회전", "좌우 반전" and "원본으로", which takes the
photo back to unedited. Nothing changes until "적용"; "취소" drops what was done in that visit. There is
no zoom and no straightening dial.

The tool is off for an item it cannot work on, and a line under the toolbar says why:

- **a video** — "이 항목은 편집할 수 없어요";
- **a GIF** — the same: a canvas keeps a GIF's first frame only, so drawing an edit would send a still;
- **a photo still being read** — "사진 불러오는 중…", the grid's square preview drawn meanwhile;
- **a photo the page could not read or decode** — "사진을 불러오지 못했어요". It still goes at the send,
  unedited, and a failed read is tried once more there.

## The edit

An edit is a set of instructions, never pixels: a quarter turn (0/90/180/270 clockwise), a left-right
mirror, a crop, and the preset the crop box is locked to. It reads in one order against the photo as
decoded, with its EXIF orientation applied: mirror, then turn — that is the photo as shown — then keep
the crop of it. The crop is a rectangle normalised to that shown frame (0..1 each way), so it means the
same part of the photo at any size: the editor, the strip's thumbnail and the send all read the same
edit through the kit's `planPhotoEdit`. "Rotate left" and "flip" act on what is shown whatever is
already applied, and keep the crop on the same part of the photo.

Edits live in `usePhotoPicker`, by photo id, for as long as the pick does. An edit that changes nothing
— the preset alone does not count — is forgotten, so "원본으로" then "적용" sends the original. Unpicking
a photo drops its edit without a word, and nothing is kept once the grid closes.

An edited photo's thumbnail in the picked strip is drawn with its edit, filling its square, with a
small pencil mark ("편집됨" to a screen reader).

## Reading the photo for the editor

The grid's previews are centre squares of at most about 440 px, so a crop of one would frame the wrong
part of the photo; the editor needs the photo itself. `loadForEdit` reads it with `ReadPhoto` when the
editor shows it — the showing photo first, then the ones either side, so a swipe usually lands on one
that is ready.

- **One read at a time.** Each holds a whole photo as base64 in page memory, as at the send.
- **Newer asks replace the waiting ones.** A quick swipe through the pick reads where it stopped, not
  every photo it passed.
- **Only while the editor is up.** When it closes — "완료", ✕, its send button, or the grid closing
  under it — the photos still waiting are dropped (`ChatImageAttach` calls `loadForEdit()` with no
  ids). A read already under way finishes and its bytes are kept; the pick's other photos are read by
  the send, one at a time in pick order.
- **A read cannot be called back.** One that lands after its photo was unpicked, or after the pick was
  let go, is dropped. A photo picked again in a new pick while an earlier pick's read of it is still out
  is read again, once that read is over, since reads stay one at a time.
- **What is read is kept for the send.** The send uses the same bytes and does not read the photo
  again. It waits for an editor read only when that read is for a photo in the pick, and then uses its
  bytes, so each photo is still read once. It does not wait for a read of a photo unpicked since, which
  is dropped when it lands and can take up to the read's two-minute timeout for an original kept only
  in iCloud; meanwhile the page can hold that read's base64 beside the send's own. Nor does it wait
  for the copy the editor makes after a read: a copy that lands once the send has started is revoked,
  not shown.

The editor does not draw the original. It draws a copy at most 2048 px on its long edge
(`makeEditRendition`): the pager keeps the showing photo and its neighbours decoded, and three 24 MP
originals would hold some 300 MB in the WebView where three copies hold about 50 MB. The copy of a PNG
or a WebP is a PNG, not painted white, so its transparency shows in the editor as the send keeps it
(an edited WebP on iOS aside — see Limits); every other photo's copy is a JPEG. A WebP's copy is not a WebP because WebKit has no WebP encoder,
and the copy is only ever shown in the page. A GIF's copy is the GIF itself, so it keeps moving. The
strip's edited thumbnail draws from the same copy.

Everything read for a photo — its bytes, its copy's object URL, its edit — is let go when it is
unpicked; everything read for the pick when the pick is sent, when it is cleared, and when the grid
closes.

## The edit is drawn at the send

`takePicked` reads the pick one item at a time, in pick order, as it always did. A photo with an edit
that changes something is then drawn with it, one photo at a time (`bakePhotoEdit`):

1. Decoded through `decodeImage` (`@chatic/shared`), the one place EXIF orientation is applied.
2. Drawn into a canvas the size `planPhotoEdit` gives, through its transform — painted white first when
   the output is JPEG, which has no transparency and would turn it black.
3. Encoded at 0.9, the quality the shell converts at, in the format `encodeTypeFor` picks: a PNG stays
   a PNG so its transparency does, a WebP stays a WebP where the browser can encode one, everything
   else is JPEG. WebKit has no WebP encoder and answers a PNG instead; that is drawn again and encoded
   as JPEG rather than sent as a PNG named WebP.
4. Named `<name>-edit.<ext>`, so the judge's duplicate check never takes it for its original.
5. The canvas is set to zero size, whatever happened — WebKit caps the canvas memory of the whole page.

A photo with no edit goes up as its own bytes, exactly as before: nothing is decoded or re-encoded for
it. A photo whose edit cannot be drawn — undecodable, no canvas, no encoder output — is refused alone,
and its notice, "편집한 사진을 만들지 못했어요" (`chat.attach.edit.bakeFailed`), is the pick's one
notice: it wins over any other reason the pick met. Its original is not sent in its place: it is not
what the person chose to send.

## Limits

- **16,777,216 px of output.** iOS WebKit draws nothing on a canvas larger than that, without an
  error. A crop bigger than it is scaled down evenly to fit: a 24 MP iPhone photo turned without a crop
  goes up at about 16.7 MP. A photo that is not edited is not touched, so it keeps its full size.
- **An edited WebP loses its transparency on iOS.** WebKit cannot encode WebP, so at the send an edited
  WebP is drawn as a JPEG on white, though the editor's copy showed the transparency. An unedited WebP
  goes as its own bytes and keeps it.
- **GIFs are not editable**, and the page only learns a photo is a GIF once it is read — the library's
  list does not say what format a photo is.
- **Videos are not editable.** In the page they are the app's file references, not bytes. Trimming is a
  later step.
- **Tiles stay square.** The grid, the strip and the message's tiles all fill squares; the edit shows in
  what is sent and in the viewer.
- **An edited photo leaves its metadata behind.** A canvas carries no EXIF, so the date taken and the
  camera go with it; the location the shell removed already.
- **Orientation in the canvas** relies on the browser drawing an `<img>` upright, which was measured in
  Chrome only (`libs/shared/src/image/decode.ts`). It needs checking on a device in the iOS WebView.

## How to verify

```bash
npx jest --config apps/web/jest.config.js apps/web/src/app/features/channels/utils/bakePhotoEdit \
  apps/web/src/app/features/channels/hooks/usePhotoPicker \
  apps/web/src/app/features/channels/hooks/usePhotoSendGrouping \
  apps/web/src/app/features/channels/components/ChatImageAttach apps/web/src/i18n/localeParity
npx nx test web-ui-kit -- photoEdit cropBox PhotoEditor EditedPhotoImage PhotoPicker
```

jsdom decodes nothing and has no canvas, so the drawing itself is checked against a stubbed canvas
(the size, transform, fill, format and clean-up asked of it). What only a device shows:

- Pick a portrait photo, rotate and crop it, send it: the message and the viewer show it upright, cut
  where the box was. Do it on iOS too, where the canvas orientation has not been measured.
- Pick a 24 MP photo (an iPhone 15 or later at its default), rotate it, send it: it arrives at about
  16.7 MP, not blank.
- Swipe through ten picked photos in the editor: the WebView stays up, and each shows within a read.
