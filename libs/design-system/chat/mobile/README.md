# @chatic/design-system-chat-mobile

What is drawn inside a mobile chat room — the attach panel and source sheet, message rows and their
content (code, link preview, files, media tiles, audio), receipts, reactions, threads, dividers and the
jump pill. It was `libs/web-ui-kit/src/composites/chat`.

`apps/web` does not import this package directly: it imports `@chatic/web-ui-kit`, which re-exports it
unchanged.

| Tags                                          | Depends on                                                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `layer:ui` `platform:web` `formfactor:mobile` | `@chatic/design-system-patterns-mobile` (sheets, the slide helper), `@chatic/design-system-components-mobile`, `@chatic/ui-kit` and `@chatic/design-system-assets` |

Block Kit rendering (`libs/block-kit`) is not here yet; the chat core layer is a later step.

## Layout

One flat folder: each component with its test and story; `src/index.ts` is the entry.

## Rules

The design rules — stateless and slot-based, no copy, semantic tokens only, one icon source, layers
pointing down, a test and a story for every component — are written once, in
[`libs/web-ui-kit`](../../../web-ui-kit/README.md#design-principles), and hold here unchanged. The
component notes are in [`docs/components`](./docs/components/README.md).

## Verify

```bash
npx nx run-many -t lint,typecheck,test -p @chatic/design-system-chat-mobile
```

The stories render in the `web-ui-kit` Storybook (`npx nx storybook web-ui-kit`), whose
`.storybook/main.ts` and `tailwind.config.js` list this package's `src`.
