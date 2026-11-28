# @chatic/design-system-patterns-mobile

The screen blocks of the mobile chat surface — headers, sheets and dialogs, viewers, list rows,
sections, layouts, media pickers and editors, empty states. They compose the components package. It was
`libs/web-ui-kit/src/composites`, except `chat` and `subscription`; the subscription cards are now
[`@chatic/subscription-ui`](../../../subscription/ui/README.md), which this package's entry re-exports unchanged.

`apps/web` does not import this package directly: it imports `@chatic/web-ui-kit`, which re-exports it
unchanged.

| Tags                                          | Depends on                                                                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `layer:ui` `platform:web` `formfactor:mobile` | `@chatic/design-system-components-mobile`, `@chatic/ui-kit`, `@chatic/design-system-assets` and `@chatic/subscription-ui`. |

## Layout

`header` · `overlay` · `layout` · `navigation` · `section` · `list` · `feedback` · `media`. `src/index.ts`
re-exports the groups and `@chatic/subscription-ui`, plus `useSlidePresence`, `SLIDE_MOTION` and
`SLIDE_FALLBACK_MS` from `overlay/slidePresence.ts`, which the chat package's `AttachPanel` uses.

## Rules

The design rules — stateless and slot-based, no copy, semantic tokens only, one icon source, layers
pointing down, a test and a story for every component — are written once, in
[`libs/web-ui-kit`](../../../web-ui-kit/README.md#design-principles), and hold here unchanged. The
component notes are in [`docs/components`](./docs/components/README.md).

## Verify

```bash
npx nx run-many -t lint,typecheck,test -p @chatic/design-system-patterns-mobile
```

The stories render in the `web-ui-kit` Storybook (`npx nx storybook web-ui-kit`), whose
`.storybook/main.ts` and `tailwind.config.js` list this package's `src`.
