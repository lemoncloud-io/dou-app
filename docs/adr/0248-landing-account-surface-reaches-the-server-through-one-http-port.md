# ADR-0248: Landing's account surface reaches the subscription server through one HTTP port

> Status: Accepted · Decided: 2026-10-28
> · Decision 7 amended by [ADR-0250](./0250-landing-reopens-card-management-on-the-payment-services-cards.md) (W-12 reopens; the card is no longer changed in place)
> Scope: `apps/landing` (`README.md` principle 9, § The server, § Layering's boundary checks,
> `src/app/config/subscriptionServer.ts`, `src/app/features/subscription/lib/port/http/`,
> `src/app/features/subscription/lib/createPortSetup.ts`), `apps/landing/.env.example`; the web
> subscription calls in `libs/http` (`gateways/subscriptions.ts`) and `libs/data`
> (`SubscriptionHttpDataSource`, `SubscriptionRepository`)
> Amends: decision 3 of [ADR-0227](./0227-landing-serves-a-public-surface-and-a-signed-in-subscription-surface.md)
> (the account surface runs on a mock behind one port, with no network). Its other decisions stand.

## Context

ADR-0227 put the web subscription screens behind one interface, `SubscriptionPort`, and ran them on an
in-memory mock until a server existed. The subscription server (chatic-backend-api's `/subscriptions`,
`/products`, `/memberships`) now answers plans, a subscription, its checkout, plan change, cancelling
and the card, and the payment provider's card window (PortOne V2 over KG Inicis) issues the billing
key that server charges.

Three things had to be settled to connect them:

- **Who the reader is.** The server only acts for a signed-in relay session, and every request has to
  be signed with it. The landing site had no session of any kind.
- **What the server does not answer yet.** Billing emails, invoices, undoing a cancellation or a
  scheduled downgrade, choosing a default card and retrying a failed payment have no server. The
  screens built for them should keep working while they are developed.
- **Where the server's address comes from.** The landing site read no environment at runtime; the
  other web apps read their addresses from an untracked `.env`, and this repository is public.

## Decision

1. **One HTTP implementation of the same port.** `createHttpPort` answers the methods the server has
   (`HTTP_METHODS`) and translates its shapes into the view types: the web products are named after
   their tier (`dou-web-tier-0N` is `pro-tier-0N` on the screens), the one subscription the server
   keeps per account becomes a list of one, a status `pending` (a first payment the provider has not
   settled) joins the port's statuses, and a checkout or an upgrade — which the server answers with the
   subscription, not an attempt — becomes an attempt the screens follow by reading the subscription
   again. A plan change's charge is estimated with the server's own proration and shown as an estimate.
2. **Signing in is the admin console's route.** The browser leaves for the OAuth relay, returns to
   W-02's callback with a code, and the shared session runtime turns it into a relay session (`config`
   init, the runtime boot, `RuntimeAuthHost` without a guest session); every request is signed with it.
   Signing out is the runtime's logout, which lands on the home page.
3. **The server's calls are the shared libraries', the translation is the landing site's.** The eight
   `/subscriptions/0/*` requests join `libs/http`'s subscription gateway, with their shapes declared
   there from the server's contract (its package does not carry the module yet), and `libs/data`'s
   `SubscriptionRepository` carries them, as it carries the store membership's. The landing site's
   HTTP port calls that repository through the runtime and keeps only what is its own: turning the
   answers into the screens' view types, and the rules around the calls. Inside the landing app the
   network lives in `lib/port/http/` and nowhere else: the session runtime and the payment SDK are
   imported there only, and loaded on first use, so neither the production host's plans page nor a
   mock-only tab downloads them.
4. **A tab runs on the server alone, or on the mock alone — never both.** The server's methods come
   from the HTTP port; every other one refuses, and the port says which are real (`supports`), so the
   screens leave out what would call the rest — the billing history, undoing a cancellation,
   cancelling a scheduled downgrade — and copy that promised the undo says only what holds. A tab runs
   on the server by default; `?mock=<scenario>` switches it to the mock alone and `?mock=off` back.
5. **The addresses come from the build's untracked `.env`**, read in `config/` only, as the other web
   apps do; `.env.example` holds placeholders. Without them the account surface runs on the mock as
   before.
6. **The card company's required payer fields are asked for on the screens.** The name and mobile number
   go on W-08 and in the add-card dialog, travel with that one checkout or card, and are not stored.
7. **The card and billing-email screens are hidden until their servers exist.** W-12, W-16 and W-24 have
   no server of their own — the cards and the emails they manage are DoU's, not the payment provider's,
   which only takes the card number in its window — so they would be answered by the mock alone. Their
   routes are not registered and every link into them is gone, behind one value
   (`MANAGEMENT_SCREENS_OPEN`); the port methods, the HTTP port and the mock stay. The card company gets
   the signed-in account's own address in place of a verified billing email.
   One entry is open anyway: changing the card from W-18 (and from a failed payment), which needs no list —
   the payer form and the provider's window put a new card on the subscription, and the server replaces
   the old one. Choosing among cards, removing one and retrying a charge stay with the hidden screens.
8. **The account surface is laid out for a phone, and a phone pays in its browser.** The desktop-only
   notice is gone. The card window is an iframe on a computer but the provider's own page on a phone,
   which the browser leaves for and comes back from with the result in the address. The port gains
   `completePaymentMethodRegistration` to read that return, and the checkout W-08 settled is kept in
   session storage across the trip (short-lived, taken away on use) because the navigation state does
   not survive it. A subscriber billed through a store is still told to manage it there.

## Alternatives

- **Keep the server's calls in the landing app**, as its own signed requests. It was the first
  version: fewer libraries touched, but a second way to reach the relay beside the repositories every
  other app uses, and calls no other app could reuse.
- **Call the server from the hooks or pages directly.** Fewer files, but the screens would have to know
  which methods have a server and handle two error vocabularies; the port was built so that swapping
  its implementation touches nothing under `pages/`.
- **A landing-only sign-in** (its own token exchange and refresh). It would duplicate the session
  runtime's credential and renewal logic, which renews only over the socket, and drift from it.
- **Compose the server with the mock** for the methods it lacks. It was the second version: every
  screen kept working, but a tab on the server then showed an empty billing history no server holds
  and undid cancellations that never happened, and kept a second account's state beside the server's.
- **Write the dev addresses in source, chosen by host.** It keeps the site free of runtime
  environment, but puts addresses the other apps keep out of this public repository into it.
- **Keep the screens and answer them from the mock.** It keeps every flow whole, but a production-bound
  surface would show a card list and verified emails that no server holds.
- **Store the payer for the next card.** It saves typing, but it is personal data kept for a form the
  card company asks for again anyway.

## Consequences

- **The account surface now has a session and a network**, but only inside `lib/port/http/`; the
  boundary checks name that folder, and the public surface is unchanged.
- **The web subscription is part of the shared data layer.** Another app reaches it the way the landing
  site does, through the runtime's `SubscriptionRepository`. Its shapes live in `libs/http` until the
  server's package carries them, and move out then.
- **The account surface's server addresses are build configuration.** A dev deploy needs them in its
  `.env`; without them it falls back to the mock rather than failing.
- **The session runtime is a lazily loaded chunk of its own** (about 0.7 MB minified), paid only by a
  tab that runs against the server.
- **Methods join the server one by one**: a method joins `HTTP_METHODS` the day its server exists, and
  what the screens left out for it comes back with it. Until then a tab on the server offers less than
  the designs — no billing history, no undoing a cancellation or a scheduled downgrade. The production
  build keeps the account surface shut until every method has one.
- **The server's sample payments are not used.** They needed the mock's stand-in window beside the
  server, which this decision removes; the provider's own test channel is the way to try a payment.
- **Shutting them costs two things.** A subscriber cannot remove the card or pick among several (changing
  it is the one thing left open, so a failed payment or an expired card can be fixed), and receipts and notices go to the sign-in address alone.
  Both are settled before the account surface opens on the production host.
- **The server's view of the signed-in account decides who may subscribe.** An account the relay
  still holds as a guest (a device account that linked a social login later) is refused by the
  subscription server, whatever the landing site shows.
