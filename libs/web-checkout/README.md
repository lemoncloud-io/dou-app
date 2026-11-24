# web-checkout — the website checkout's calls, provider windows and rules

`@chatic/web-checkout` is what the subscription website (`apps/landing`) and the web app's in-app
checkout (`apps/web`, a browser tab or a virtual shell that declares the web) share to sell a subscription billed by a payment provider rather
than a store. It holds no screens, no words and no sign-in: each app draws its own pages and signs in its
own way, and hands this library what it needs.

| Part                                                                                                 | What it does                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `http/paymentPort.ts` — `createPaymentPort`                                                          | The subscription server's payment calls behind the port's methods: plans, the subscription, card registration, checkout, plan changes and cards |
| `http/wire.ts`, `http/errors.ts`                                                                     | The server's shapes read into the screens' view types, and its refusals into `SubscriptionPortError`                                            |
| `http/windowReturn.ts`, `http/stripeResult.ts`                                                       | What a provider window or a return address says about a card registration                                                                       |
| `http/sandboxWindow.ts`                                                                              | The stand-in card window used with the payment server's mock provider: no real card, no charge                                                  |
| `windows` entry — `portOneWindow`, `createStripeWindow`                                              | The providers' own windows, the only files that import `@portone/browser-sdk` and `@stripe/stripe-js`                                           |
| `billingCountry.ts`, `catalog.ts`, `changeKindOf.ts`, `paymentMethods.ts`, `calendar.ts`, `money.ts` | The rules: which provider bills a country, the plan catalog, which plan change is allowed, card grouping, dates, money formatting               |
| `types.ts`, `port/*`                                                                                 | The view types and the port's contract                                                                                                          |

## What an app hands in

`createPaymentPort({ api, session, paymentWindow, returnUrl, signInProvider?, sandbox? })`:

- `api` — the signed-in calls, `SubscriptionApi`; both apps pass the runtime's `SubscriptionRepository`.
  The server answers the card calls for the account's main user only (`403 … main user only`), so a guest or
  a paired device is refused.
- `session.user()` — the signed-in user, or `null`. The library never signs in; the website adds its own
  sign-in methods around the port.
- `paymentWindow` — the window a card is registered in: a provider's window from the `windows` entry, or
  `createSandboxWindow()` with the mock provider.
- `returnUrl(purpose, planId)` — where a provider that leaves the page sends the reader back.
- `sandbox` — when set, every payer-scoped call carries `?sandbox=1`. Where the flag comes from is the app's
  business: the website keeps it per tab, the web app takes it from the virtual shell's harness values.

## Keeping the providers out of a store build

The main entry imports no provider SDK; only the `windows` entry does. The web app loads its in-app checkout,
and with it this library, as a lazy chunk it requests only where the web sells, so the phone app never loads it
and no chunk the web loads at start carries an SDK (`yarn check:web-payment-sdk` after `nx build web`).
