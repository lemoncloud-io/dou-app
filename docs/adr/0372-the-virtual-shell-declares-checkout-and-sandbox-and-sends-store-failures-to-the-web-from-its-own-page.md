# ADR-0372: The virtual shell declares checkout and sandbox, and points to the web from its own page when the store cannot answer

> Status: Accepted; decision 6 superseded by [ADR-0374](./0374-the-virtual-shell-s-checkout-and-host-choices-are-the-shell-core-s-options.md) · Decided: 2026-11-24
> · Scope: `apps/shell-adapter/**` · `apps/web/src/config/adapters/checkout/**` · `apps/web/src/app/features/subscription/**`
> · `libs/runtime-web/src/hostCapabilities/shellHarness.ts`
> · Builds on: [ADR-0214](./0214-the-virtual-shell-is-a-package.md) · Related: [ADR-0373](./0373-a-web-checkout-sells-inside-the-app-through-a-shared-checkout-library.md)

## Context

The subscription flow could not be tried end to end in the virtual shell (`yarn local`). With no checkout
picked the shell declared nothing, so the web fell back to the store rule and the virtual store, which only
answers for a picked store, refused. Picking the web checkout sent the app's frame to the subscription
website with `location.assign`: the frame left the app's origin, the bridge and the shell's tools went with
it, and there was no way back. No sandbox reached the subscription website, and a subscription website
running on this machine could not be used.

The mobile app's own rules do not move: it declares its device's store only, and it never points an app
buyer at web checkout (ADR-0276).

## Decision

1. **The shell picks three things — backend, checkout, sandbox — and a table decides what it declares.**
   Checkout is `store` (the device preset's store, the default), `web` or `none`; `apple`, `google` and
   `legacy` (declare nothing) are still read. The sandbox is kept under `dou.sandbox`. `checkoutPlan` in
   `apps/shell-adapter/src/checkout.ts` holds the table and its tests pin every row: on localhost a web
   checkout declares `[]`, since no payment server runs there; the sandbox is never on against prod or
   localhost.
2. **Harness values travel in their own global, beside the declaration.** The same injection script sets
   `window.CHATIC_SHELL_HARNESS = { version: 1, sandbox, subscriptionWeb? }`. The web reads it only in a dev
   or local build, inside the app's bridge; a production build ignores it. The mobile app injects none, and a
   shell-adapter test fails if any mobile source names it.
3. **A web checkout sells inside the app** — in the shell as in a browser tab, decided in
   [ADR-0373](./0373-a-web-checkout-sells-inside-the-app-through-a-shared-checkout-library.md). The shell's part is the
   sandbox: with it on, the in-app checkout's payer calls carry `?sandbox=1` and the card window is a stand-in
   for the payment server's mock provider, and what still leaves for the subscription website (managing a
   subscription) goes to the local one when it answered, with `?sandbox=1`. A production build ignores the
   harness values, so it has no sandbox.
4. **When the virtual store cannot answer, the shell's page says so, not the app.** The first refused
   catalog or purchase puts a notice on the shell page with **Switch to web** (keep `web`, relaunch); on
   localhost it says payments cannot be checked and offers nothing. It never switches on its own, and the
   app's screen keeps its own wording, so a store build with a failing store can never show "go to the web".
5. **An in-app sandbox is named for what it is.** Turning the sandbox on with a store checkout shows that the
   real store sandbox is a device and store setting (a store test account, a test build) and that the shell
   only imitates the store, up to the purchase.
6. **Agents use `window.virtualShell`** (superseded by ADR-0374: the core's `options.set`). `checkout.set`, `sandbox.set` (each relaunching the app) and
   `status().checkout` / `status().sandbox` carry the same choices and notices.
7. **The app's debug settings are the second source.** Without the shell, a dev or local build reads the
   debug setting `checkout.sandbox`; the shell's value wins where there is one, and a production build reads
   neither. The debug overlay draws `port.checkout` as a list of the runtime's candidate adapters, those the
   host does not offer disabled, and `checkout.sandbox` as a switch. A dev build says on the checkout screen
   and in the shell's in-app sandbox notice where the sandbox is changed.

## Consequences

- The default changed: a shell started with nothing picked now declares the device's store, and on dev the
  virtual store answers. `legacy` keeps the old no-declaration launch.
- A purchase in the virtual store still stops at the dev server's refusal of its fake receipt; letting a dev
  sandbox purchase reach a subscription through the server's sample receipt waits on checking that the
  deployed dev server accepts it.
- The shell core has no picker for these choices on its panel yet; until it does, they are made at start or
  through `window.virtualShell`, and the status line is `status().checkout.display`.
- Payments against a backend on this machine stay closed until the local backend harness runs a payment
  server and the subscription website can sign in locally.
