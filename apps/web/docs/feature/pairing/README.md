# pairing — signing a browser in from a phone that is already signed in

`apps/web/src/app/features/pairing` is where device pairing lives: a browser (or a phone that is not
signed in) shows an eight-digit code and its QR, and a signed-in app approves it. Today the folder
holds one piece, the QR reader the approval screen will use. The screens, their routes and their
entry points are not here yet; this document grows with them.

## Layout

```text
features/pairing/
└── lib/pairingQr.ts   photo (base64) → the eight-digit code, or null
```

## Reading a pairing QR from a photo

The mobile app has no live QR scanner, and adding one would mean a new native dependency and camera
settings in the WebView. The approval screen takes a photo through the existing camera bridge instead
and reads the code from it in the page:

1. `appBridge.openCamera({ mediaType: 'photo', includeBase64: true, maxWidth: 1024, quality: 0.7 })`.
   Always send `maxWidth` and `quality` with `includeBase64`: an original-size photo is several MB of
   base64 crossing the bridge, and 1024 px is plenty for a QR code.
2. `decodePairingQr(asset.base64, { mimeType: asset.type })` draws the photo on a canvas — scaled to 1024 px on its longest edge, so a photo sent without
   `maxWidth` still costs a bounded buffer — finds a QR
   code with `jsqr` (trying the inverted image too, for a code shown on a dark screen) and keeps its
   text only if it is exactly eight digits.

The contract of the reader:

- **A pairing QR holds the code and nothing else.** No link, no separator, so nothing in it is ever
  opened or followed — the digits only fill the input. Any other text is treated as "not ours".
- **`null` has two causes**, and `decodePairingQr` does not say which: no QR code in the photo, or a QR
  code holding something else. A screen that words the two differently calls `readQrText` (pixels →
  text) and `toPairingCode` (text → code) itself.
- **An old app returns no base64.** Before the mobile shell passed the capture options on, it dropped
  them and answered with a `uri` only — a path inside the app the page cannot read. The web ships ahead
  of the app, so the screen has to treat an asset without `base64` as "update the app to scan; type
  the code for now", not as a failed read.
- **Desktop has no camera bridge.** The desktop shell handles no `OpenCamera`, so the approval screen
  there offers typing only.
