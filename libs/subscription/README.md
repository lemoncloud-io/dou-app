# @chatic/subscription

**The subscription rules that run no payment:** the plan catalog in won and in dollars, which plan change a
subscription allows, which provider bills a country and in which currency, how cards are grouped, the date helpers
and the money format, and the view types the subscription screens share. The web checkout
([`@chatic/checkout-web`](../checkout/web/README.md)), the subscription website (`apps/landing`) and the web app's
subscription screens all read them.

Tags: `layer:core-lib` · `platform:any` · `formfactor:any`. No dependency, no DOM, no network.

| File                | What it decides                                                                         |
| ------------------- | --------------------------------------------------------------------------------------- |
| `catalog.ts`        | `PLAN_CATALOG` and `planCatalogIn(currency)`: the tiers and their monthly prices        |
| `changeKindOf.ts`   | whether a target plan is new, current, an upgrade, a downgrade or blocked               |
| `billingCountry.ts` | the provider and currency of a billing country, and when a payer's details are required |
| `paymentMethods.ts` | the default card and the cards grouped by provider                                      |
| `calendar.ts`       | ISO dates and day arithmetic                                                            |
| `money.ts`          | `formatMoney`                                                                           |
| `types.ts`          | the plan, subscription, card and payment view types                                     |

These were the rule files of `@chatic/web-checkout`, which still re-exports them, so its importers did not change.
The cards that draw a subscription are the nested [`ui`](./ui/README.md) package.

## Verify

```bash
npx nx run-many -t lint,typecheck,test -p @chatic/subscription
```
