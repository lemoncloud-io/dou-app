# App icons

The app icons a user can pick in My Page → App icon. Every icon shows the same logo — same art,
same size, same position as the primary icon — and only the background changes. That is the rule a
new icon has to keep: the logo is the brand, so an icon that redraws, recolours or moves it is not an
alternate icon, it is a different logo.

| Id             | Background                              |
| -------------- | --------------------------------------- |
| `DefaultIcon`  | lime `#B0EA10` (the primary icon)       |
| `WhiteIcon`    | white                                   |
| `MidnightIcon` | radial charcoal, `#33333F` → `#08080B`  |
| `AuroraIcon`   | diagonal mint → blue → violet           |
| `SkyIcon`      | vertical sky blue `#5BB8FF` → `#D2EEFF` |

All five, the primary icon included, come out of one generator and one logo master. They used to be
drawn by hand, and the white icon's logo ended up about 4% smaller than the lime one's, so switching
icons made the logo jump; on Android both baked the whole square icon into a 54 dp foreground, so the
logo showed at three quarters of its iOS size. Generating
every icon from the same master is what keeps them from drifting apart again — do not hand-edit a
generated file.

## How the icons are made

[`app-icons/mascot.png`](../../app-icons/mascot.png) is the logo alone on a transparent 1024 × 1024 canvas, at exactly the place it sits in
the primary icon. It was cut out of `DefaultIcon.appiconset/1024.png` by keying out the lime
background; replace it with the designer's own transparent export when there is one — nothing else
changes.

`yarn generate:app-icons` (`scripts/generate-app-icons.js`) reads it and the background specs at the
top of the script, and writes, per icon:

- **iOS** — `ios/Chatic/Images.xcassets/<Id>.appiconset`, the same sizes the hand-made sets carry. The
  project compiles every icon set in the catalog (`ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS`),
  so a new set needs no project change.
- **Android** — the background as a vector gradient (`drawable/ic_launcher_<key>_background.xml`), the
  adaptive-icon XML, and 48 dp legacy bitmaps for API 24–25, which predate adaptive icons.
- **Web** — the 180 px preview the picker sheet shows, `apps/web/public/assets/app-icons/<Id>.png`.

All Android icons share one foreground and one monochrome layer, written once:
`mipmap-*/ic_launcher_mascot_foreground.webp` and `…_monochrome.webp` — and one notification small
icon, see [Notification icon](#notification-icon).

- The foreground places the whole 1024 composition in the middle 72 dp of the 108 dp adaptive canvas —
  the part a launcher shows — so the logo sits where it does on iOS. It stays inside the 66 dp circle
  no launcher mask cuts into: its farthest opaque pixel is 456 px from the centre of the master, and
  the safe circle allows 469 px at that scale.
- The monochrome layer is what Android 13+ tints for themed icons. Android tints everything opaque, so
  the generator turns the logo's dark face transparent; otherwise the themed icon is a blank cloud.
  (The hand-made layers this replaced used the coloured foreground, square included, as their
  monochrome layer, so a themed launcher showed a plain square.)

## Notification icon

On Android a push banner follows the icon the user picked: switch to Aurora, and the next banner
shows the Aurora icon. It does so in two places, because Android lets an app colour only one of them.

- **The large icon**, right of the text, is the active launcher icon itself, in full colour —
  `ActiveAppIcon` finds the enabled icon alias (the same `…Icon` aliases switching flips) and draws
  its icon. A sender's face, when a push carries one, takes this slot instead.
- **The small icon**, beside the app name and in the status bar, is `drawable-*/ic_notification.png`,
  tinted with the active icon's accent. Android draws a small icon from its alpha alone and tints it —
  white in the status bar, the accent in the shade — so this slot can never hold the coloured logo.
  The push service used to pass the launcher icon, whose opaque square showed as a plain grey square;
  the generator instead takes the monochrome layer's cut-out silhouette, crops it square around the
  logo and fits it into the 22 dp live area of a 24 dp icon (the adaptive canvas's margins would leave
  the logo a dot). One file serves every icon, since the logo is the same in all of them.

The accent is a single colour per icon, `accent` in `ICONS`, written to
`values/ic_launcher_accents.xml` as `notification_accent_<key>` and attached to each alias as its
`io.chatic.dou.notification_accent` meta-data. A gradient background names the stop that reads as
the icon (Aurora's blue, Sky's top).

The accent is a request, not a guarantee. From Android 12 the system UI checks it against the shade's
background as it draws the banner, darkens or lightens it until it reads, and picks a white or dark
glyph for the circle; an ordinary push cannot opt out (only media and call notifications can). No one
colour passes unchanged on both a light and a dark shade, so the circle differs between the modes. On
Android 15 the lime is exact in dark mode, with a dark glyph, and darkened to `#357700` in light mode;
the white icon's accent comes out grey.

A banner the FCM SDK draws itself — a message with a `notification` block while the app is in the
background, which the server does not send but the Firebase console does — cannot look up the active
icon, so it gets the silhouette and DefaultIcon's lime and no large icon: the icon through the
manifest's `default_notification_icon`, the colour through `messaging_android_notification_color` in
`firebase.json`. react-native-firebase already declares the colour meta-data (default white) and
fills it from there, so a second declaration in the manifest fails the merge.

The Play Store listing icons beside `res/` (`src/main/*-playstore.png`) are not part of the build and
the generator does not touch them; the store listing is uploaded by hand.

## Adding an icon

1. Add an entry to `ICONS` in `scripts/generate-app-icons.js` — `id` (PascalCase, ends in `Icon`),
   `key` (lowercase, used in Android resource names), an `accent` (see
   [Notification icon](#notification-icon)), and a `solid`, `linear` or `radial` background —
   and run `yarn generate:app-icons`.
2. iOS: add the id under `CFBundleIcons` → `CFBundleAlternateIcons` in `ios/Chatic/Info.plist`.
3. Android: add an `activity-alias` named `.<Id>` to `AndroidManifest.xml`, `enabled="false"`, with
   `@mipmap/ic_launcher_<key>` and `…_round` as its icons and an `io.chatic.dou.notification_accent`
   meta-data pointing at `@color/notification_accent_<key>`. Without it the icon's banners fall back
   to the lime accent.
4. Add `{ id, label }` to `AVAILABLE_ICONS` in `src/app/services/dynamicAppIcon/types.ts`. The web
   picker lists whatever the app reports, so an app build without the icon never offers it.
5. Add `mypage.appIcon.<Id>` to both `apps/web/public/locales/*/translation.json`.
6. Add the id to `APP_ICON_IDS` in `apps/web/src/app/runtime/telemetry/appIcon.ts`. The usage
   statistics count an id missing there as `other`, so skipping this step loses the icon's name in
   the numbers, not the count.

The icon reaches users with the next store build — the pictures live in the app binary. The web
preview and label can ship first; they stay unused until an app that reports the icon asks for them.

## Switching

`AppIconManager` on iOS calls `setAlternateIconName`, and iOS shows its own "you have changed the
icon" alert. On Android it enables the chosen `activity-alias` and then disables **every other icon
alias** — an alias that opens `MainActivity` and whose name ends in `Icon` — read from the package
manager rather than trusted from the "current icon" JS stored. A stale stored value would otherwise
leave two DoU icons on the launcher. The name suffix is the contract: an alias added later for
another reason must not end in `Icon`, or an icon change will switch it off. It refuses an alias the
manifest does not declare before changing anything, so a bad id cannot leave the app with no
launcher icon.

The JS side still skips the native call when the stored name already equals the pick
(`DynamicAppIconService.setAppIcon`, `AppIconBridge.changeIcon`). So a stale stored value is
corrected on the next switch to a _different_ icon, not when the user re-picks the one JS thinks is
active.

The web picker shows the icon the app reports. The app reports the primary icon by its stored name
`DefaultIcon` but lists it with a `null` id, so the picker treats `null`, `'default'` and
`'DefaultIcon'` as the same icon (`isDefaultAppIcon` in `apps/web`'s `useAppIcon`).
