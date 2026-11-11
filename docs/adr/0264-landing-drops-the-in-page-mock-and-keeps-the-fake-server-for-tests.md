# ADR-0264: Landing drops the in-page mock from the running app and keeps the fake server for tests

> Status: Accepted · Decided: 2026-11-02
> Scope: `apps/landing` (`README.md` principle 10, § Layering, § Two surfaces, § Plans before checkout
> opens, § The server, § Sandbox payments, § The tests' fake server, § Traps;
> `src/app/config/subscriptionServer.ts`, `src/app/routes/`, `src/app/features/home/components/Header.tsx`,
> `src/app/features/subscription/` — `lib/createPortSetup.ts`, `lib/port/standInWindow.ts`,
> `routes/index.tsx`, `components/DevTools.tsx`, `components/MockPaymentWindow.tsx`, `testing/`)
> Amends: decisions 4 and 5 of [ADR-0248](./0248-landing-account-surface-reaches-the-server-through-one-http-port.md);
> decision 1 of [ADR-0235](./0235-landing-lists-the-plans-on-every-host-before-checkout-opens.md)
> Builds on: [ADR-0263](./0263-landing-runs-sandbox-payments-on-the-payment-servers-mock-provider.md) (sandbox
> payments)

## Context

The account surface had three things called "mock", and two of them sat in the running app. The page's
own mock was an in-memory server: `?mock=<scenario>` switched a tab to it, and a build without the
server's addresses ran on nothing else. It came with a stand-in consent page, a stand-in receipt page, a
scenario panel and a stand-in card window. The subscription server's own `?mock` answers samples; this
app never sends it. Sandbox payments (ADR-0263) run the real server on the payment server's mock
provider.

The in-page mock was the contract while no server existed. That is over: the server answers every screen
that is open, and sandbox payments reach the parts the in-page mock was kept for — a trial ending, a
renewal, an expiry — against the server itself, which is what breaks in practice. What the in-page mock
still did was disagree with the server quietly: a flow that worked on it said nothing about the server,
and a developer could be on one while believing they were on the other. And it shipped: every visitor
downloaded it with the account-surface chunk.

The screens' tests are a different matter. They render every screen in every state with no network, and
an in-memory server that moves the way the real one does is what makes that cheap.

## Decision

1. **The running app has no in-page mock.** `?mock=` is not read; a tab with the server's addresses runs
   on the server, with sandbox payments as its no-charge mode. The stand-in consent and receipt pages,
   their routes, and the scenario panel are gone. The dev corner panel is the sandbox panel alone.
2. **No addresses, no account surface.** A build without the server's addresses opens only the plans
   page, on the catalog port, as the production host does (`isSubscriptionAccountOpen` — the host gate
   and the addresses together). The header drops its sign-in link there too.
3. **The fake server moves to `testing/` and is the tests' alone.** It keeps its scenarios, fail flags
   and stored state; its provider now answers a sign-in at once with the scenario's choice, so no consent
   page is needed. A test fails when anything outside `testing/` and the test files imports it.
4. **The stand-in card window stays,** behind a small interface of its own (`lib/port/standInWindow.ts`):
   sandbox payments open it, and the tests' fake server does.

## Alternatives

- **Keep `?mock=` but rename it** to sandbox or similar. It would remove the name clash only; the in-page
  server would still disagree with the real one without saying so, and still ship.
- **Keep the in-page mock where the build has no addresses.** It made the account surface browsable with
  no `.env`, but that is exactly the tab that tells a developer nothing about the server, and the
  addresses are one copy of `.env.example` away.
- **Drop the fake server altogether** and test against recorded server answers. The screens' tests would
  then pin wire shapes instead of behaviour, and every flow (cancel, upgrade, a failed charge) would need
  a recording per step.

## Consequences

- Seeing a screen in a given state needs a server account in that state, or sandbox payments to make
  one. Some states have no server path yet: the billing-email screens (hidden), retrying a failed charge,
  undoing a cancellation. They are covered by the tests alone.
- The account-surface chunk no longer carries the in-page server.
- Old links with `?mock=` open the server like any other address: the query is ignored, and nothing
  breaks or switches.
- A screen test still reads the fake server's scenarios by name (`?mock=active`), in the test only.
