# web-checkout — the old entry of the web checkout

`@chatic/web-checkout` was one package holding both the subscription rules and the web checkout. They are now
two packages, and this one only re-exports them so that the subscription website (`apps/landing`) and the web
app's in-app checkout (`apps/web`) import what they did before:

| Entry                          | Re-exports                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `@chatic/web-checkout`         | [`@chatic/subscription`](../subscription/README.md) (the rules) and [`@chatic/checkout-web`](../checkout/web/README.md) (the calls) |
| `@chatic/web-checkout/windows` | `@chatic/checkout-web/windows`: `portOneWindow` and `createStripeWindow`, the only code that loads a provider SDK                   |

`src/index.test.ts` pins that the entry exports exactly the two packages' names. New code imports the two packages
directly; this entry goes when the importers have moved.
