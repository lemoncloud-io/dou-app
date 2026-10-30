# pairing — signing a device in from another device that is already signed in

`apps/web/src/app/features/pairing` is device pairing on the web: a browser (or a phone that is not
signed in) shows an eight-digit code and its QR, and a signed-in app approves it. Every entry sits
behind `feature.auth.devicePairing`, which is on in every stage; turning it off hides every entry again.

The flow itself is `@chatic/app-runtime`'s (`runtime.session.usePairingRequest`, documented in its
session docs); this feature is the screens around it.

## Layout

```text
features/pairing/
├── pages/
│   ├── PairingCodePage.tsx     the requesting device's code screen — /mypage/login/pair
│   ├── PairingApprovePage.tsx  the approving app's screen — /mypage/pairing/approve
│   └── PairingDevicesPage.tsx  my devices and the sign-ins I approved — /mypage/devices
├── components/
│   └── QrScannerSheet.tsx      the full-screen live scanner the approve screen opens
├── hooks/                      useNow (a countdown's clock) ·
│                               usePairingApproval (look up → approve or decline) ·
│                               usePairingDevices (the two lists and their removals)
└── lib/
    ├── pairingCode.ts          0734-4168 formatting, m:ss for the time left
    ├── pairingTargets.ts       approvable clouds (owned + invited), the options, the default
    ├── liveQrScanner.ts        the camera stream in the page → a code (LiveQrScanner)
    ├── scanPairingQr.ts        the camera bridge's photo → a code, or why there is none
    ├── deviceRows.ts           kind labels; standing approvals, newest first, unclaimed flagged
    └── pairingQr.ts            pixels (a photo or a frame) → the eight-digit code, or null
```

The routes are registered in `routes/PrivateRoutes.tsx`, not in `features/mypage`: the addresses sit
under `/mypage`, but a static path outranks `mypage/*`, and one feature does not import another. For the
same reason the flag hook, `useDevicePairingEnabled`, lives in `src/app/hooks`: every entry — the login
screen, My page, settings, withdrawal, the home switch sheet and these pages — reads the flag through it.

## The code screen

`/mypage/login/pair`, opened from the login screen's "Sign in with another device". The login screen
hands its location state on, so leaving after a sign-in goes back past both screens to wherever the user
started (`navigate(-2)`), or home when the app has nothing behind them.

- **Signed-out devices only.** The device asking for a sign-in must not hold one. The relay accepts a
  code request from a guest session alone, so the screen sends anyone else to My page — deciding at
  mount, because a successful pairing turns this very session into an account. A guest inside a cloud
  it entered on its own invite is signed in there too (`runtime.session.isInOwnCloudSession`): the
  screen asks it to sign out of that cloud first and shows the code once it has, because an approval
  of the same cloud would give the browser a second identity in it. DoU Home and a paired cloud are
  fine; "Add a cloud with another device" opens the screen from either.
- **What it shows per state:** a spinner while requesting or applying; the code (`0734-4168`), its QR, the
  time left and "check that the app's approval screen shows `<this browser>`" while waiting; the code
  struck through with "get a new code" once it expired; a retry for declined, lost and failed.
- **After a sign-in** it says which scope the approval gave: the account's name for a relay approval
  (the approver's name — it is the same account), "you're in the approved cloud" for a cloud one.
- Leaving the screen stops the polling. A pending pairing expires on the server after three minutes;
  there is no cancel call.

### A cloud approval

When the approver chose one of its clouds, the code screen's flow enters that cloud as a guest through
the ordinary cloud switch — the relay's delegation answers for the approving account in that cloud —
and adds the cloud to the paired-cloud list (`runtime.session` docs). The tokens are re-issued through
the delegation before the switch, so a browser that holds older tokens for the same cloud (an invite
it accepted earlier, while on DoU Home) becomes the approver there at once, not silently at the next
check. The browser stays a relay guest. The home switch sheet then lists the cloud under "Approved
clouds" (home docs), and "Add a cloud with another device" there opens this same screen for a second
cloud, leaving the current cloud session as it is.

**A revoked approval signs the browser out.** The approval was the sign-in, so when the relay stops
delegating the cloud — the paired-cloud check (`runtime/useCloudCredentialRenewal`), or a switch the
relay refuses with 403 — the browser says so and runs the ordinary session logout. It is also the only
way back in for the browser's own invites: the relay ties the revoked grant to the auth session that
claimed it and refuses that session's delegation into the cloud (`403 … pairing revoked`) even for an
invite it accepted there, until a new auth session replaces it. Every paired cloud ends with the
logout, not only the revoked one.

### A phone signing in through another phone

The same screen opens inside the app for a guest: phone B shows the code, phone A approves it. B then
holds a pairing session — a **secondary device** of A (`runtime.session.useIsPairedSession`): A signing
out or revoking the approval signs B out at its next renewal, by design. So B's sign-in toast says so,
My page carries a one-line "signed in as a secondary device" notice, and B shows neither the approval
entry nor the approved sign-ins — a secondary device never approves another. B introduces itself to the
approver as `iPhone` / `Android` (`client.platform` `ios` · `android`), and the approval screen calls it
a phone. A desktop app has no code screen; it already signs in by phone or Google.

## The approval screen

`/mypage/pairing/approve`, from My page's "Approve web sign-in". Both the entry and the page require
the flag, `isNative()`, an **account** (not a guest) and a session that is **not** itself a secondary
device (`runtime.session.useIsPairedSession`). Approving hands on a sign-in, so the approving device has
to hold one: the server would take an approval from a browser's phone login, and a guest app's approval
of its invited clouds, as well — keeping approvals in signed-in apps is this screen's rule, not the
server's.

1. **The code.** One input keeps digits only (a pasted `0734-4168` or spaced code works) and looks the
   code up once it has eight. The same eight digits are not looked up twice in a row — a lookup claims
   the code for this account, so a repeat only earns a 403. "Scan QR" fills the same input
   (below).
2. **Who asks.** A large card: the requester's name, phone or browser by `client.platform`, the time
   left, and "approve only if this is the browser you just opened". A developer tool (`purpose:
'debug'`) adds a warning and a checkbox, and approval stays off until it is ticked.
3. **What it may use.** Two sections, one per kind of approval, each headed by what that kind gives
   the browser:
    - **Sign in as my account** — "My whole account" (relay): DoU Home, the clouds the account
      created, and the account settings. The invited clouds are **not** part of it — the relay's
      answer is the account's session, and an invited cloud's membership belongs to the device user
      that accepted the invite, which the account session does not carry. When the account holds an
      invited cloud, the option says so and points at the section below.
    - **Use one cloud only** — each cloud the account can switch to, marked "Cloud" and, under its
      name, whether the account created it or was invited to it. The owned clouds come from the relay
      catalog, then the invited ones, which live only in this device's cloud cache
      (`useInvitedClouds`) because the catalog lists owned clouds alone. The relay checks a cloud
      approval the way it checks the approver's own switch, so an invited cloud the app can enter can
      be approved too. The browser stays a relay guest with no account settings, and more clouds are
      added one approval at a time from its "Add a cloud with another device".

    One approval carries one target, so a single radio group spans both sections. The active slot
    starts selected, an invited cloud included. With nothing to offer the screen says so and shows no
    approve button. The button repeats the scope ("Approve only the Lemon cloud"), the same words the
    device management screen and the sign-out confirm use later — all three name a cloud through
    `useCloudName` (below).

4. **The answer.** Approve or decline, a toast, and back. Errors come from
   `runtime.session.classifyPairingError` (404 not found, `400 … pairing expired`, 403 on the code or on
   the target, 409 already handled), each with its own sentence.

## Device management

`/mypage/devices`, from My page's "Devices". A browser guest has no account to list devices for and
is sent back; everyone else gets the first section, and an approving app the second.

- **Devices** — `UserRepository.listDevices()` on the active slot, so in a cloud the header reads
  "Devices in this cloud" and the list is that cloud's. Each row: name (`runtime.session.deviceDisplayName`
  — phones and the desktop app save no name, so the server keeps their user agent, shown as `iPhone`,
  `Android`, the OS, or `<browser> · <OS>`), kind (`''` reads as unknown),
  online or last activity, "this device" on `current`. Every other row can be removed after a confirm;
  in a cloud the confirm adds that a web sign-in also has to be removed from the approvals, because the
  pairing would bring it straight back. `closed` only says a close was sent, so the list is re-read
  rather than trusted. A removal that fails — a device or an approval — says so in a toast; it is a
  security step, and closing the confirm as if it worked would leave the person believing it did. The
  list is asked for on every open (`devicesKeys`, per cloud), and a server that does not answer
  `user.list-device` shows an error with a retry — dev's customer clouds do not yet. An empty list
  says "No devices connected" rather than leaving an empty card; a cloud may hold none for this
  account until one of its devices saves itself there.
- **Approved sign-ins** — inside the app, on an account that is not a secondary device — the devices
  that can approve. Standing approvals, newest first, each with requester, scope ("my whole account" /
  "only Lemon", the same words the approval used), approval and sign-in times. A relay approval nobody
  claimed is a lost session and is flagged for removal; a cloud approval never carries a session, so it
  never is. Removing one warns per scope: a relay sign-in ends at once, a cloud one cannot come back but
  an open screen may last until its tokens expire. The header links to the approval screen. With
  none standing, the section says "No approved sign-ins" in place of the list.

## Signing out of an approving app

Settings' logout and the withdrawal screen go through `runtime.session.usePairingAwareLogout` while the
flag is on: an approving app with approvals still standing shows `mypage/components/PairingLogoutDialog`
("the N sign-ins this device approved end too", each with requester and scope, plus a caveat when a
cloud approval is among them), revokes them all on confirm and then opens `/auth/logout` as before. With
nothing approved, in a browser, on a secondary device, or when the list cannot be read, the logout
happens at once.

## Naming a cloud

The approval screen, the approved sign-ins and the sign-out confirm all name a cloud through
`useCloudName` (`src/app/hooks`): the cached name, then the relay catalog's, then the id. The cache
comes first because an invited cloud is not in the catalog at all, and because an owned cloud's cached
name is the fresh one right after a rename. Naming is not narrowed to the clouds this session can
switch to — an approval made earlier can point at an invited cloud this session no longer lists, and it
still reads as that cloud's name.

## Reading a pairing QR

"Scan QR" opens a live scanner first and falls back to a photo.

### Live, in the page

`QrScannerSheet` covers the screen with the back camera and a guide square; `LiveQrScanner` behind it
opens the stream with `getUserMedia` (`facingMode: environment`, about 1280×720, no audio), and every
150 ms draws the current frame on a canvas at 640 px on its longest edge and reads it. The first frame
holding a pairing code fills the input and closes the sheet; a QR holding anything else shows "not a
DoU QR" for two seconds while scanning goes on.

- **It needs no newer app.** The camera stream is the WebView's own: Android's
  (react-native-webview) answers the page's camera request with the app's `CAMERA` permission, asking
  for it when it is not granted yet, and iOS's WKWebView asks the person once per page. Both app
  builds already declare the camera permission, so the scanner works on shells that predate it —
  unlike the photo path below, whose base64 answer needs a newer one.
- **Frames alternate between the image and its inverse.** A code on a dark-mode screen only reads
  inverted; decoding both on every frame would double the main-thread cost, so each frame tries one.
  jsqr 1.4's own `onlyInvert` throws (it never builds the inverted image), so `readQrText` inverts the
  pixels itself.
- **When the camera cannot be opened.** No `getUserMedia` (`canScanLive()` is false) goes straight to
  the photo. A refusal of the camera (`getUserMedia`'s `NotAllowedError`) is the person's answer: no
  photo camera is put up next. Only Settings can undo it, so a prompt offers the way there at once
  ("Open Settings" → `OpenSettings`), and a note saying to allow the camera or type the digits stays
  after the prompt is closed. Anything else — no camera, one in use, a stream whose `play()` is
  refused — falls back to the photo. A refused `play()` is never read as a refusal of the camera: the
  iOS WebView keeps `mediaPlaybackRequiresUserAction`, an autoplay rule, and by then the camera was
  already granted.
- **It lets go of the camera** on a code, on close, on unmount and when the page is hidden (iOS
  suspends the camera in the background, and returning to a frozen picture reads as broken).

### From a photo

The fallback takes a photo through the existing camera bridge and reads the code from it in the page:

1. `appBridge.openCamera({ mediaType: 'photo', includeBase64: true, maxWidth: 1024, quality: 0.7 })`.
   Always send `maxWidth` and `quality` with `includeBase64`: an original-size photo is several MB of
   base64 crossing the bridge, and 1024 px is plenty for a QR code.
2. `decodePairingQr(asset.base64, { mimeType: asset.type })` draws the photo on a canvas — scaled to
   1024 px on its longest edge, so a photo sent without `maxWidth` still costs a bounded buffer — finds
   a QR code with `jsqr` (trying the inverted image too, for a code shown on a dark screen) and keeps
   its text only if it is exactly eight digits.

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
