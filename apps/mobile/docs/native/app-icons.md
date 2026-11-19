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
`mipmap-*/ic_launcher_mascot_foreground.webp` and `…_monochrome.webp`.

- The foreground places the whole 1024 composition in the middle 72 dp of the 108 dp adaptive canvas —
  the part a launcher shows — so the logo sits where it does on iOS. It stays inside the 66 dp circle
  no launcher mask cuts into: its farthest opaque pixel is 456 px from the centre of the master, and
  the safe circle allows 469 px at that scale.
- The monochrome layer is what Android 13+ tints for themed icons. Android tints everything opaque, so
  the generator turns the logo's dark face transparent; otherwise the themed icon is a blank cloud.
  (The hand-made layers this replaced used the coloured foreground, square included, as their
  monochrome layer, so a themed launcher showed a plain square.)

The Play Store listing icons beside `res/` (`src/main/*-playstore.png`) are not part of the build and
the generator does not touch them; the store listing is uploaded by hand.

## Adding an icon

1. Add an entry to `ICONS` in `scripts/generate-app-icons.js` — `id` (PascalCase, ends in `Icon`),
   `key` (lowercase, used in Android resource names), and a `solid`, `linear` or `radial` background —
   and run `yarn generate:app-icons`.
2. iOS: add the id under `CFBundleIcons` → `CFBundleAlternateIcons` in `ios/Chatic/Info.plist`.
3. Android: add an `activity-alias` named `.<Id>` to `AndroidManifest.xml`, `enabled="false"`, with
   `@mipmap/ic_launcher_<key>` and `…_round` as its icons.
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
