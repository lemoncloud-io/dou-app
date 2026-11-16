# ADR-0263: Landing runs sandbox payments on the payment server's mock provider, on development hosts only

> Status: Accepted · Decided: 2026-11-02
> · Decision 1 amended by [ADR-0311](./0311-landing-opens-the-account-surface-on-the-production-host-in-won-only.md) (no sandbox on the production host either, whatever the build)
> Scope: `apps/landing` (`README.md` § Sandbox payments, `src/app/features/subscription/lib/createPortSetup.ts`,
> `lib/port/http/` — `createHttpPort.ts`, `sandboxWindow.ts`, `live.ts`, `index.ts` —,
> `components/DevScenarioPanel.tsx`, `components/MockPaymentWindow.tsx`); the payer-scoped subscription
> calls in `libs/http` (`gateways/subscriptions.ts`) and `libs/data` (`SubscriptionHttpDataSource`,
> `SubscriptionRepository`)
> Builds on: [ADR-0262](./0262-landing-bills-outside-korea-in-dollars-through-its-own-card-dialog.md) (the
> billing-country split and the card windows)

## Context

The subscription flow could be exercised two ways, and neither covered the part most likely to break.
The page's own mock is an in-memory server: it walks every screen but never touches the subscription
server. The dev server is the real thing, but every checkout needs a real test card in a provider window,
and a subscription renews monthly — a trial ending, a renewal charge or a cancelled subscription
expiring could not be watched at all.

The payment server now has a mock provider: it accepts any card token, charges at once, and can renew on
a short period. The subscription server sends a payer's calls to it when the call carries `?sandbox`,
and takes `?interval` on a sandboxed start. It reads `?sandbox` per call for the card calls, and does not
refuse it on production.

## Decision

1. **Sandbox payments are a switch of a server tab, on development hosts only.** `?sandbox=1` turns them
   on and `?sandbox=0` off, kept for the tab; the dev panel has the same switch and a renewal-period
   picker (`10m`, `1h`, `1d`, or the product's month). The switch is decided in `createPortSetup` alone,
   and only where the account surface is open — the production host runs the catalog port and never
   sends the query — and never in a build whose addresses are production's (`VITE_ENV=PROD`), whatever
   host it runs on. The query is taken out of the address once read, so the tab's stored choice is the
   only one. A banner says "Sandbox payments — no real charge" on every page while it is on.
2. **The HTTP port carries `?sandbox` on the six payer-scoped calls, every card call included, and on
   nothing else.** `issue`, `start`, the card list, adding a card, choosing the default and removing one.
   The calls on the subscription itself and the membership read stay as they are: the server follows
   the record. `?interval` goes on a sandboxed `start` only.
3. **The query goes through the shared subscription repository.** The six methods of `libs/http`'s
   subscription gateway and `libs/data`'s data source and repository take it as an optional last
   argument; without it the request is the one it always was. Landing does not build signed requests of
   its own.
4. **A sandboxed card is entered in the mock's stand-in window.** The mock provider's `issue` values are
   fake, so no provider SDK is called; the stand-in window's outcome becomes a made-up `sandbox-…` token,
   read by the same `windowResultOf` as a real window, and goes into `start` or `card` as any card would.

## Alternatives

- **Landing builds the sandboxed requests itself** with the runtime's request signer. No library change,
  but a second, partial HTTP client — without the shared one's credential recovery, error
  classification and request log — and against the rule that this app's server calls go through the
  runtime's repository (ADR-0248).
- **A sandbox mode on the HTTP client** (every call of a session gets the query). Simpler to thread, but
  it would also tag the calls the server deliberately leaves alone, and every other app shares the
  client.
- **Keep testing renewals with the page's mock only.** It already simulates them, but against itself; what
  breaks in practice is the agreement between the screens and the real server.

## Consequences

- `libs/http` and `libs/data` grow an optional argument on six methods. Nothing else calls them with it.
- **Production is guarded by the client only.** The server accepts `?sandbox` on production, so anyone
  calling its API directly could start a subscription without paying; limiting it there is the server's
  to decide before it ships the query to production.
- An account that has started once in sandbox is no longer eligible for the free trial, and leaving the
  sandbox for a real subscription means cancelling and waiting for the period to end.
- The sandbox needs the dev relay like everything else. A build with production's addresses refuses it,
  but a hand-made `.env` is only as safe as the addresses in it; sandbox records on production would sit
  among real users'.
