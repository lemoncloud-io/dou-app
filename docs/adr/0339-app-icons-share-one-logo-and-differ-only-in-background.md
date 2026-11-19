# ADR-0339: App icons share one logo and differ only in background

> Status: Accepted · Decided: 2026-11-17 · Implemented: `feat/alternate-app-icons`
> · Scope: `scripts/generate-app-icons.js`, `apps/mobile/app-icons/`, the icon sets under
> `apps/mobile/ios` and `apps/mobile/android`
> · The module doc is [apps/mobile app icons](../../apps/mobile/docs/native/app-icons.md)

## Context

The app let a user pick between two icons, lime and white, each drawn by hand per platform. Adding
three more (Midnight, Aurora, Clear Sky) raised two questions at once. What may an alternate icon
change? And how are five icons kept consistent across iOS, Android's adaptive layers and the web
preview?

The hand-made pair already showed the cost of the second question left open. The white icon's logo
was about 4% smaller than the lime one's, so switching icons made the logo jump. On Android both
baked the square icon into a 54 dp foreground, so the logo showed at three quarters of its iOS size.
Both used that coloured foreground as their themed-icon layer too, so Android 13's themed launcher
showed a plain square.

## Decision

1. **An app icon changes only its background.** The logo — art, size and position — is the same in
   every icon, the primary one included. A design that redraws, recolours or moves the logo is a
   different logo, not an alternate icon.
2. **Every icon is generated from one transparent logo master and a background spec**, by
   `yarn generate:app-icons`. That includes the primary icon. Generated files are not edited by hand.
3. **Android icons share one foreground and one monochrome layer**, with each icon's background a
   vector gradient. The foreground places the iOS composition in the visible 72 dp of the adaptive
   canvas, and the monochrome layer has the logo's face cut out.
4. **On Android, switching disables every other icon alias**, read from the package manager, not
   only the one JS last stored as active. An icon alias is one that opens the main activity and whose
   name ends in `Icon`, so an alias added later for another purpose is left alone. It refuses an alias
   the manifest does not declare before changing anything.

## Consequences

- **The logo cannot drift between icons**, because there is only one copy of it. A new icon is a
  background spec plus four registration edits (Info.plist, the manifest alias, the mobile icon
  list, the translations).
- **The primary icon was regenerated.** It matches the old one except for about 200 anti-aliased
  edge pixels out of a million. On Android it now shows at full iOS size, a visible change on every
  launcher.
- **Themed icons on Android 13+ now show the logo** instead of a square.
- **The master was cut out of the old 1024 px primary icon**, not exported by a designer. That is
  good enough at every size the platforms ask for; a designer's export can replace the file with no
  other change.
- **The generator needs `@napi-rs/canvas`**, already in the lockfile as a transitive dependency, now
  declared as a dev dependency. It runs only when someone regenerates the icons, never in a build.
- **A stale "current icon" in JS storage can no longer leave two DoU icons on an Android launcher.**
  Its remaining effect is a wrong checkmark in the picker until the next switch.

## Alternatives considered

- **Hand-made icons per platform, as before.** This is what produced the size drift, and five icons
  across iOS, Android and the web means about 140 files to keep in step by hand.
- **Designer-supplied finished icons per variant.** It moves the drift to whoever exports them, and
  every new background becomes a design round trip rather than a colour spec.
- **Icons that restyle the logo** (a neon outline, a recoloured logo, scenes around a smaller one).
  These were sketched and turned down: the logo is the brand mark, so it stays fixed.
- **Composing icons at build time** (a Gradle or Xcode step). That puts a native image dependency into
  every build to save a step that runs only when an icon changes. The generated files are committed
  instead, and the script is run by hand.
