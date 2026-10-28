# ADR-0248: Landing's account surface reaches the subscription server through one HTTP port

> Status: Accepted · Decided: 2026-10-28
> Scope: `apps/landing` (`README.md` principle 9, § The server, § Layering's boundary checks,
> `src/app/config/subscriptionServer.ts`, `src/app/features/subscription/lib/port/http/`,
> `src/app/features/subscription/lib/createPortSetup.ts`), `apps/landing/.env.example`
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
3. **The network lives in `lib/port/http/` and nowhere else.** The session runtime, the request
   signing and the payment SDK are imported there only, and loaded on first use, so neither the
   production host's plans page nor a mock-only tab downloads them.
4. **While the account surface is in development the port is composed.** The server's methods come
   from the HTTP port and the rest from the mock, signed in on a fresh account. A tab runs on the server
   by default; `?mock=<scenario>` switches it to the mock alone and `?mock=off` back.
5. **The addresses come from the build's untracked `.env`**, read in `config/` only, as the other web
   apps do; `.env.example` holds placeholders. Without them the account surface runs on the mock as
   before. A variable asks the server for sample payments, with the in-page stand-in as the card window.
6. **The card company's required payer fields are asked for on the screens.** The name and mobile number
   go on W-08 and in the add-card dialog, travel with that one checkout or card, and are not stored.

## Alternatives

- **Call the server from the hooks or pages directly.** Fewer files, but the screens would have to know
  which methods have a server and handle two error vocabularies; the port was built so that swapping
  its implementation touches nothing under `pages/`.
- **A landing-only sign-in** (its own token exchange and refresh). It would duplicate the session
  runtime's credential and renewal logic, which renews only over the socket, and drift from it.
- **Hide or mock the screens with no server.** Hiding breaks the flows the composed port keeps whole
  (W-24 needs billing emails before W-08); mocking all of them would test nothing against the server.
- **Write the dev addresses in source, chosen by host.** It keeps the site free of runtime
  environment, but puts addresses the other apps keep out of this public repository into it.
- **Store the payer for the next card.** It saves typing, but it is personal data kept for a form the
  card company asks for again anyway.

## Consequences

- **The account surface now has a session and a network**, but only inside `lib/port/http/`; the
  boundary checks name that folder, and the public surface is unchanged.
- **The account surface's server addresses are build configuration.** A dev deploy needs them in its
  `.env`; without them it falls back to the mock rather than failing.
- **The session runtime is a lazily loaded chunk of its own** (about 0.7 MB minified), paid only by a
  tab that runs against the server.
- **Methods move from the mock to the server one by one**: a method joins `HTTP_METHODS` the day its
  server exists. The production build keeps the account surface shut until every method has one.
- **The server's view of the signed-in account decides who may subscribe.** An account the relay
  still holds as a guest (a device account that linked a social login later) is refused by the
  subscription server, whatever the landing site shows.
