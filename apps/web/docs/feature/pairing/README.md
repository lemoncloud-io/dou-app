# pairing — signing a device in from another device that is already signed in

`apps/web/src/app/features/pairing` is device pairing on the web: a browser (or a phone that is not
signed in) shows an eight-digit code and its QR, and a signed-in app approves it. Every entry sits
behind `feature.auth.devicePairing`, which is on in LOCAL and DEV only until the design and wording are
settled.

The flow itself is `@chatic/app-runtime`'s (`runtime.session.usePairingRequest`, documented in its
session docs); this feature is the screens around it.

## Layout

```text
features/pairing/
├── pages/PairingCodePage.tsx   the requesting device's code screen — /mypage/login/pair
├── hooks/                      useDevicePairingEnabled (the flag) · useNow (the countdown's clock)
└── lib/
    ├── pairingCode.ts          0734-4168 formatting, m:ss for the time left
    └── pairingQr.ts            photo (base64) → the eight-digit code, or null
```

The routes are registered in `routes/PrivateRoutes.tsx`, not in `features/mypage`: the addresses sit
under `/mypage`, but a static path outranks `mypage/*`, and one feature does not import another. The
login screen's entry reads the flag itself for the same reason.

## The code screen

`/mypage/login/pair`, opened from the login screen's "Sign in with another device". The login screen
hands its location state on, so leaving after a sign-in goes back past both screens to wherever the user
started (`navigate(-2)`), or home when the app has nothing behind them.

- **Guests only, decided once.** The relay accepts a code request from a guest session alone, so the
  screen sends anyone else to My page — but it decides at mount, because a successful pairing turns
  this very session into an account.
- **What it shows per state:** a spinner while requesting or applying; the code (`0734-4168`), its QR, the
  time left and "check that the app's approval screen shows `<this browser>`" while waiting; the code
  struck through with "get a new code" once it expired; a retry for declined, lost and failed.
- **After a sign-in** it says which scope the approval gave: the account's name for a relay approval
  (the approver's name — it is the same account), "you're in the approved cloud" for a cloud one.
- Leaving the screen stops the polling. A pending pairing expires on the server after three minutes;
  there is no cancel call.

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
