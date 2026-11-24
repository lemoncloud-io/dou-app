# ADR-0372: The virtual shell declares checkout and sandbox, and points to the web from its own page when the store cannot answer

> Status: Accepted · Decided: 2026-11-24
> · Scope: `apps/shell-adapter/**` · `apps/web/src/config/adapters/checkout/**` · `apps/web/src/app/features/subscription/**`
> · `libs/runtime-web/src/hostCapabilities/shellHarness.ts` · `libs/web-checkout/**` · `apps/landing/src/app/features/subscription/**` (imports only)
> · Builds on: [ADR-0214](./0214-the-virtual-shell-is-a-package.md), [ADR-0276](./0276-a-browser-tab-hands-subscription-sales-to-the-website.md)

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
3. **The shell's web checkout is the app's own screen.** Only when the runtime is hybrid, the host declares
   `['web']`, the harness values are there and the build is a dev or local one, the web's checkout port opens a
   shell-only checkout screen (`/subscription/shell-checkout`) instead of the subscription website. It sells
   with the app's session — a frame of the website would have needed a second sign-in — and leaving it reads
   the membership again; the server holds the result. With the sandbox on, the payer calls carry
   `?sandbox=1` and the card window is a stand-in for the payment server's mock provider. Any other host keeps
   `location.assign`.
4. **The checkout's calls, provider windows and rules are one library.** They move from the subscription
   website to `@chatic/web-checkout`; the website keeps its screens, words and sign-in and behaves as before,
   the web app draws its own screen. The providers' SDKs sit behind the library's `windows` entry, and the web
   loads its screen behind a build-time dev-or-local check, so a production web build carries neither.
5. **When the virtual store cannot answer, the shell's page says so, not the app.** The first refused
   catalog or purchase puts a notice on the shell page with **Switch to web** (keep `web`, relaunch); on
   localhost it says payments cannot be checked and offers nothing. It never switches on its own, and the
   app's screen keeps its own wording, so a store build with a failing store can never show "go to the web".
6. **An in-app sandbox is named for what it is.** Turning the sandbox on with a store checkout shows that the
   real store sandbox is a device and store setting (a store test account, a test build) and that the shell
   only imitates the store, up to the purchase.
7. **Agents use `window.virtualShell`.** `checkout.set`, `sandbox.set` (each relaunching the app) and
   `status().checkout` / `status().sandbox` carry the same choices and notices.

## Consequences

- The default changed: a shell started with nothing picked now declares the device's store, and on dev the
  virtual store answers. `legacy` keeps the old no-declaration launch.
- A purchase in the virtual store still stops at the dev server's refusal of its fake receipt; letting a dev
  sandbox purchase reach a subscription through the server's sample receipt waits on checking that the
  deployed dev server accepts it.
- The shell core has no picker for these choices on its panel yet; until it does, they are made at start or
  through `window.virtualShell`, and the status line is `status().checkout.display`.
- The server answers the card calls for an account's main user only: a shell signed in by pairing with a phone
  is refused, and one signed in with Google is not.
- A provider window that leaves the page (the won provider on a phone-sized screen) comes back to the
  shell-only screen, which finishes the registration from the return address.
- Payments against a backend on this machine stay closed until the local backend harness runs a payment
  server and the subscription website can sign in locally.
