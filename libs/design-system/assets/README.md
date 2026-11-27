# @chatic/design-system-assets

The icon set and the brand images, shared by every web surface. Tags: `layer:ui`, `platform:web`,
`formfactor:any`.

```text
src/icons/    Icon* aliases over lucide-react, plus the Figma-exported glyphs that have no lucide
              equivalent (duotone thread, pin, gallery, tier, nav, notify, file-kind…), one per file
src/images/   brand marks and illustrations, exported as bundler-resolved URLs
              (douLogo, douMark, douWordmarkNavy, douWordmarkLime, defaultPlaceAvatar,
              douHomeAvatar, myCloudIllustration)
```

| Import                                | Gives            |
| ------------------------------------- | ---------------- |
| `@chatic/design-system-assets`        | icons and images |
| `@chatic/design-system-assets/icons`  | icons only       |
| `@chatic/design-system-assets/images` | images only      |

`@chatic/web-ui-kit` re-exports both from its `resources/icons` and `resources/assets`, so its
components and `apps/web` keep their imports. Not to be confused with `@chatic/assets` in the
repository's root `assets/` folder, which holds the images `apps/web`, `apps/landing` and
`apps/desktop-web` import directly.

## Rules

- `src/icons/index.ts` is the only file here or in `@chatic/web-ui-kit` that imports `lucide-react`.
  Mobile components import `Icon*` aliases, so swapping the icon library there touches that file and
  nothing else.
- A Figma-exported glyph is one component per file, fills `currentColor`, takes `size` in pixels, and
  gets a test next to it.
- An alias with no current caller is the normal state of this barrel, not dead code.

## Tests

`jest.config.js` runs the glyph tests (`npx jest` in this folder, or `nx test
@chatic/design-system-assets`). Image imports resolve to a file stub there.
