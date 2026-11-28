# @chatic/design-system-components-desktop

The single-purpose pieces of the desktop chat surface — the skeleton pulse, a labelled form field, the hover
hint, the rail tile, the scroll hint, settings rows, pane header classes — and the UI hooks the desktop
screens share: Escape to close, roving focus, listbox keys, media queries, scroll overflow, the narrow
viewport and copy to clipboard. They came from `apps/desktop-web/src/app/shared`, which keeps the
pieces that call the runtime, the desktop shell or carry app copy.

| Tags                                           | Depends on                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| `layer:ui` `platform:web` `formfactor:desktop` | `@chatic/ui-kit` (Radix primitives and `cn`), `lucide-react` icons. |

The classes are not self-contained. Colours come from `@chatic/design-system-tokens-desktop`
(`desktopColors`); the type scale (`text-micro`, `text-callout`, `text-caption`, `text-heading`), `z-raised`
and `ease-tactile` come from the consuming app's Tailwind `theme.extend`; `focus-ring`, `tactile` and
`hit-target` are utilities in the app's stylesheet. Today that app is `apps/desktop-web`, whose Tailwind
`content` names this package's `src` so a build without the Nx graph still generates its classes.

## Layout

`skeleton` · `form-field` · `hint` · `rail-tile` · `scroll-hint` · `settings-row` · `pane-header` ·
`hooks(8)`. `src/index.ts` re-exports the groups. The component notes are in
[`docs/components`](./docs/components/README.md).

## Rules

- No copy and no runtime: every label is a prop, nothing imports `@chatic/runtime*`, `@chatic/host-*`
  or an app's locale. A piece that needs one of them stays in the app.
- No router: a piece that navigates (`PageShell`) stays in the app.
- Semantic token classes only (`bg-background`, `text-muted-foreground`, `border-hairline`), so the
  desktop token set decides the colours.

## Verify

```bash
npx nx run-many -t lint,typecheck,test -p @chatic/design-system-components-desktop
```

There is no desktop Storybook yet; the pieces are seen in `apps/desktop-web`.
