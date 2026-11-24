# ADR-0373: A web checkout sells inside the app, through a checkout library shared with the website

> Status: Accepted · Decided: 2026-11-24
> · Scope: `libs/web-checkout/**` · `apps/web/src/app/features/subscription/**` ·
> `apps/web/src/config/adapters/checkout/**` · `apps/landing/src/app/features/subscription/**` (imports only) ·
> `scripts/check-web-payment-sdk.js`
> · Supersedes, for starting a subscription: [ADR-0276](./0276-a-browser-tab-hands-subscription-sales-to-the-website.md)
> · Related: [ADR-0372](./0372-the-virtual-shell-declares-checkout-and-sandbox-and-sends-store-failures-to-the-web-from-its-own-page.md)
> (the virtual shell's sandbox)

## Context

Where the web sells (`runtime.checkout.kind === 'web'`: a browser tab, or a virtual shell that declares the
web), the plan picker handed the reader to the subscription website (ADR-0276). The website signs in on its
own, with Google, so a reader already signed in to the app signed in a second time; in the virtual shell the
app's frame left the app altogether. Framing the website inside the app kept the second sign-in.

The phone app sells through its store and must never point a buyer at web checkout (ADR-0276 § 4).

## Decision

1. **DoU on the web pays on the web, inside the app; DoU on a phone pays through its store.** Where the web
   sells, the hand-off opens the app's own checkout (`/subscription/checkout`): billing country, plans, the
   payer fields the won provider needs, a card window, the start of the subscription. It runs on the app's
   session. Managing a subscription (the list, cards, cancelling) still leaves for the website.
2. **The calls, provider windows and rules are one library, the screens are each app's.** They move from the
   website to `@chatic/web-checkout` (`createPaymentPort`, the server's shapes and refusals, the PortOne and
   Stripe windows, billing country, catalog, plan-change rules, money). The library signs nothing in; each app
   hands it the signed-in calls, the user, the card window, the return address and the sandbox flag. The
   website keeps its screens, words and sign-in and behaves as before.
3. **A store host never loads it.** The screen and the provider SDKs are a lazy chunk the route loads only
   when the checkout is the web; a store or an empty declaration redirects to the plan picker without loading
   it (`InAppCheckoutRoute.test.tsx`). Only the screen's folder takes values from the library
   (`inAppCheckoutBoundary.test.ts`), and the SDKs sit behind the library's `windows` entry, so no chunk the
   web loads at start carries them (`yarn check:web-payment-sdk` on a production build).

## Consequences

- A production web build carries the checkout's chunk, and the phone app loads that build without requesting
  it. Whether a file the store build never runs is acceptable to app review was not checked; a person decides.
- In a browser tab the in-app checkout is a real payment on production. It has no sandbox there; the
  sandbox is tried in the virtual shell on dev.
- The server answers the card calls for an account's main user only, so a guest, or a shell paired from a
  phone, is told to sign in with Google.
- The won provider may leave the page on a phone-sized screen; it comes back to `/subscription/checkout`,
  which finishes the registration from the return address.
