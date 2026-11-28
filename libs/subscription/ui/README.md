# @chatic/subscription-ui

The subscription screens' cards for the mobile form factor: `StatusBanner`, `ProductCard`, `PlanCompareCard`,
`PlanBulletList`, `SelectableCard`, `KeyValueRows` and `BenefitItem`. They draw what they are handed and hold no
words, no plan rules and no payment calls; the rules are [`@chatic/subscription`](../README.md) and the screens are
the apps' own. It was `libs/design-system/patterns/mobile/src/subscription`.

| Tags                                          | Depends on                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `layer:ui` `platform:web` `formfactor:mobile` | `@chatic/design-system-components-mobile`, `@chatic/design-system-assets` and `@chatic/ui-kit` |

`@chatic/design-system-patterns-mobile` (and through it `@chatic/web-ui-kit`) re-exports this package unchanged, so
an importer of either keeps working. Component notes are in [`docs/components`](./docs/components/README.md).

## Verify

```bash
npx nx run-many -t lint,typecheck,test -p @chatic/subscription-ui
```

The stories render in the `web-ui-kit` Storybook (`npx nx storybook web-ui-kit`), whose `.storybook/main.ts` and
`tailwind.config.js` list this package's `src`.
