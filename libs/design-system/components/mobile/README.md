# @chatic/design-system-components-mobile

The single-purpose pieces of the mobile chat surface — buttons, inputs, avatars, badges, chips, the
message bubble, the audio bar, the brand mark, the toast. Each draws one thing and composes no other
component of this design system. It was `libs/web-ui-kit/src/foundations`.

`apps/web` does not import this package directly: it imports `@chatic/web-ui-kit`, which re-exports it
unchanged.

| Tags                                          | Depends on                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `layer:ui` `platform:web` `formfactor:mobile` | `@chatic/ui-kit` (Radix primitives and `cn`) and `@chatic/design-system-assets` (icons, images). |

## Layout

`button(9)` · `input(8)` · `badge(8)` · `avatar(7)` · `brand(2)` · `chip(2)` · `audio(2)` · `bubble` ·
`checkbox` · `divider` · `switch` · `text` · `toast`. `src/index.ts` re-exports the groups, plus
`FLOATING_PANEL` (the floating surfaces' class string), which the patterns package's photo grid uses.

## Rules

The design rules — stateless and slot-based, no copy, semantic tokens only, one icon source, layers
pointing down, a test and a story for every component — are written once, in
[`libs/web-ui-kit`](../../../web-ui-kit/README.md#design-principles), and hold here unchanged. The
component notes are in [`docs/components`](./docs/components/README.md).

## Verify

```bash
npx nx run-many -t lint,typecheck,test -p @chatic/design-system-components-mobile
```

The stories render in the `web-ui-kit` Storybook (`npx nx storybook web-ui-kit`), whose
`.storybook/main.ts` and `tailwind.config.js` list this package's `src`.
