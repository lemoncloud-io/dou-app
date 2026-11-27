# @chatic/checkout-store

**Store purchases for a React Native app: App Store and Google Play subscriptions through
`react-native-iap`.** One package, two strategies — `apple` and `google` — and the app picks one
once, when it builds the service. The split is by store, not by operating system: the stores' rules
differ (subscription groups and a management page on one side, offer tokens and plan replacement on the
other). It becomes two packages only if the two stores come to need different native SDKs
([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)).

Tags: `layer:adapter` · `platform:mobile` · `formfactor:any`. Product and purchase types are
`@chatic/ports`' `StoreProduct` and `StorePurchase`.

```ts
import { SubscriptionIapService, appleStore, googleStore } from '@chatic/checkout-store';

const store =
    Platform.OS === 'android'
        ? googleStore({ skus: androidSkus, planOrder: androidPlans })
        : appleStore({ skus: iosSkus });
const purchases = new SubscriptionIapService(logger, store);
```

An app that installs this package installs `react-native-iap` too: list it in the app's own
`package.json` so React Native autolinks it. The SKU lists come from the app's configuration; the
mobile app reads them in `apps/mobile/src/config/families.ts`.

| Export                                    | Does                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `SubscriptionIapService(logger, store)`   | connect, list products, purchase, finish, read current purchases, open the store's page |
| `appleStore({ skus })`                    | the App Store strategy                                                                  |
| `googleStore({ skus, planOrder })`        | the Play strategy; `planOrder` ranks plans for a plan change                            |
| `replacementModeFor(planOrder, old, new)` | the Play replacement mode for a plan change                                             |
| `StoreStrategy`                           | what a strategy answers: its SKUs, product mapping, purchase request, management page   |

## What each strategy decides

|                 | `apple`                                                           | `google`                                                                                |
| --------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Products        | one per product; the billing period from StoreKit's period fields | one per base plan, with its free-trial and base offer tokens                            |
| Purchase        | no offer token needed                                             | refuses a purchase with no offer token, before logging or calling the store             |
| Plan change     | —                                                                 | looks up the current purchase by product id and sends its token with a replacement mode |
| Management page | `apps.apple.com/account/subscriptions`                            | `play.google.com/store/account/subscriptions`                                           |

## Rules

- **A failed store connection is logged where it happens.** Without that line the person sees "payment
  failed" while the real reason, that the connection never opened, would exist nowhere.
- **Android plan changes need the old purchase.** A change carries the previous purchase token and a
  replacement mode only when both plan ids are present and the old purchase is found by product id.
  A higher plan (by its place in `planOrder`) replaces with time proration, a lower one is deferred to
  the end of the period, and equal ranks prorate. A plan not in `planOrder` ranks below every listed
  one: a change to it from a listed plan is deferred, and a change between two unlisted plans prorates.
- **iOS products carry no `localizedPrice`.** The price comes from `displayPrice`; reading the removed
  field returned `undefined` over it and every iOS plan looked "store unavailable". StoreKit reports a
  period unit of `empty` for a product with no period, which is dropped so it is never read as a
  billing period.
- **Finishing a transaction is its own step, and a failure there is logged and thrown.** iOS does not
  finish a transaction automatically (`andDangerouslyFinishTransactionAutomatically` is off), so the
  web finishes it after validating. The store re-presents an unfinished transaction, which is how a
  purchase that already validated turns into a second charge.
- **The store's refusal is logged in the service**, not in the bridge handler: the web records that a
  purchase failed, but only this layer sees why. The attempt log says whether an offer token was sent,
  never the token.
- **The purchase request keeps both store fields.** `apple` is always filled; `google` is filled only by
  the Play strategy. `react-native-iap` reads the one for the platform it runs on.
