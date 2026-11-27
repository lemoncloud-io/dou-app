# @chatic/design-system-tokens

The colour, radius and density values the mobile and desktop chat surfaces draw with, as CSS custom properties (HSL
channels, read as `hsl(var(--token))`), plus the Tailwind colour maps that turn them into classes.

Three projects, one per form factor:

| Project                                | Folder     | Tags                                           | Holds                                                      |
| -------------------------------------- | ---------- | ---------------------------------------------- | ---------------------------------------------------------- |
| `@chatic/design-system-tokens`         | `.`        | `layer:ui` `platform:web` `formfactor:any`     | values mobile and desktop share, per theme                 |
| `@chatic/design-system-tokens-mobile`  | `mobile/`  | `layer:ui` `platform:web` `formfactor:mobile`  | `apps/web` and `libs/web-ui-kit` (the phone-class surface) |
| `@chatic/design-system-tokens-desktop` | `desktop/` | `layer:ui` `platform:web` `formfactor:desktop` | `apps/desktop-web` (the desktop shell)                     |

What stays the same across form factors is brand, behaviour and accessibility; what differs is
density and layout. A value lives in the common layer only when mobile and desktop hold exactly the
same value for it in that theme. Where they differ, each form factor keeps its own value in its
layer; neither is picked over the other.

## Files

```text
src/light.css            common :root
src/dark.css             common .dark
src/tailwind.cjs         hsl(), commonColors, radius
mobile/src/light.css     mobile :root
mobile/src/dark.css      mobile .dark
mobile/src/tokens.css    the entry: common light → mobile light → common dark → mobile dark
mobile/src/tailwind.cjs  mobileColors = commonColors + the mobile-only names, radius
desktop/src/…            the same four files for desktop (desktopColors)
```

An app imports one entry and one colour map:

```css
/* apps/web/src/styles.css — first line, before any other rule */
@import '../../../libs/design-system/tokens/mobile/src/tokens.css';
```

```js
// apps/web/tailwind.config.js
const { mobileColors, radius } = require('../../libs/design-system/tokens/mobile/src/tailwind.cjs');
// theme.extend.colors = mobileColors, theme.extend.borderRadius = radius
```

The imports are relative paths because `libs/design-system/*` is outside the yarn workspaces, so
there is no `node_modules/@chatic/…` link for Vite's CSS resolver or `require` to follow. That breaks
the rule that a package can move without its importers changing; when `libs/web-ui-kit` moves under
`libs/design-system/`, these paths move with it, or the family joins the workspaces and the imports
become package names. Nx still sees the
dependency through the `require` in the Tailwind config, so a token change marks the app affected.
The colour maps are `.cjs` so that the apps' Tailwind content globs (which take in every dependency's
`.js`) do not read their token names as class names.

## Why the light and dark files are separate

`:root` and `.dark` have the same specificity on `<html>`, so whichever comes later wins. A token can
be common in one theme and form-factor-specific in the other (`--background` is white on both in
light, different in dark; `--overlay` is the reverse). If one file held both themes, the mobile
`:root` would come after the common `.dark` and override it in dark mode. The entry files import every
light block before any dark block, which keeps the cascade the one the apps had when each declared
both blocks inline.

The same holds for anything layered on top: a host that overrides a token in `:root` after importing
an entry has to restate its dark value in a later `.dark` block (see
`libs/web-ui-kit/src/resources/styles/tokens.css`).

## Adding or changing a token

1. Put the declaration in `light.css` and `dark.css` of the form factor that uses it, both themes.
   If both form factors use it with the same value in a theme, put it in the common file for that
   theme instead.
2. If a class should resolve to it, add it to that layer's colour map (`commonColors` when both
   form factors map it).
3. For desktop, `apps/desktop-web/src/tokenContrast.spec.ts` reads these files and checks every
   foreground/background pair against its contrast floor.

Figma is the source for every value; the hex beside a declaration is the Figma swatch it came from.
`DESIGN.md` at the repository root maps the swatches to the tokens.

## Not here

- `apps/admin`, `apps/landing` and `apps/block-kit-builder` keep their own palettes in their
  `styles.css` and do not import these files.
- The desktop settings preview rule (`.dark [data-palette-preview='mist']`) stays in
  `apps/desktop-web/src/styles.css`: it is a screen's rule, not a token.
