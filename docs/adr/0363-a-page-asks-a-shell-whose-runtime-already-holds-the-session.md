# ADR-0363: A page asks a shell whose runtime already holds the session

> Status: Accepted · Decided: 2026-11-20 · Implemented: `feat/runtime-offer-held`
> · Scope: `libs/bridge-messages/src/types/model/runtime.ts` (`RuntimeOffer.held`, bridge 2.35.0);
> `libs/runtime-core/src/bridge/contract.ts` (`offerHoldsSession`) and `host.ts` (the contract refusal);
> `libs/runtime-web/src/settleSessionOwner.ts`; `apps/mobile/src/app/services/runtime/`
> (`nativeRuntimeHost.ts` `holdsSession`, `runtimeHold.ts`, `runtimeOffer.ts`) and
> `apps/mobile/src/app/webview/AppWebView.tsx`
> · The behaviour is documented in [apps/mobile docs/runtime](../../apps/mobile/docs/runtime/README.md#the-pages-side-of-the-bridge),
> [apps/web docs/bridge](../../apps/web/docs/bridge/README.md) and
> [libs/runtime-core docs/bridge](../../libs/runtime-core/docs/bridge/README.md)
> · Amends: [ADR-0309](./0309-the-phone-shell-may-own-the-session-settled-per-launch.md) decision 2 (a page
> whose own setting says not to never asks)

## Context

ADR-0309 lets the phone app's runtime own the session, settled per launch: the app offers in
`window.CHATIC_APP_RUNTIME`, the page says `RuntimeHello`, and the app's runtime starts on that hello. A
page with no offer it can speak, or whose own setting says not to (`VITE_SESSION_MIRROR_DISABLED`),
never asks and runs its own runtime.

That setting is the web's kill switch for the app's runtime, and a web deploy is how it is pulled. But
a deploy reaches app processes that are already running, and the offer read the same whether the app's
runtime had already taken the session in that process or had not started. A page loaded after the
deploy into a process whose runtime held the session — a reload, or the WebView's content process
starting over — could not tell, never asked, and booted a second session beside the runtime's. The same
held for a page that shares no contract with the runtime. So the kill switch was only safe from a fresh
app process, and a rollback had to go through the default owner (ADR-0330), which waits for the next
start. The gap mattered once production was to run on the app's runtime (2026-11-20): the kill switch
then had to be a lever that works mid-process.

## Decision

1. **The offer says when the session is held.** From bridge 2.35.0 the app adds `held: true` to the
   offer once its runtime holds the session in this process: from the first start (the first hello) on
   a launch it owns, while that start is still running, until a start answers `null` (a decline or a
   failed boot). A start in flight counts, because it answers the hello that began it when it finishes,
   and a page that booted its own runtime meanwhile would be a second owner.
2. **A page that finds `held` always asks.** Its own setting and its contracts no longer decide for it:
   it says `RuntimeHello` and takes the answer as any page does. A page that shares no contract hears
   `RUNTIME_CONTRACT_MISMATCH` and boots nothing, which is the existing unsettled screen. The page logs
   that it asked (`session.owner_held_asked`).
3. **The next page load hears it, not the current one.** The app writes the hold to a small module the
   WebView reads, and the WebView rebuilds its injected script when it changes. Both WebView platforms
   inject the current script into each load. The runtime's own module stays off the startup path. A load
   that starts in the render or so before the WebView takes the new script still misses it.
4. **A page with no shared contract is refused whenever the process runtime holds the session.** The
   app's bridge host answered `RUNTIME_CONTRACT_MISMATCH` only once it had itself answered some page
   `native`; a page reaching it after a first hello found the runtime still starting, or on a fresh bridge
   (a WebView remount), was told `web` beside a running runtime. The host now refuses whenever the
   runtime it waited for holds the session, and answers `web` only when the runtime declined.

## Alternatives

- **Roll back only through the default owner.** Naming `web` as the default (ADR-0330) keeps every
  running process on one owner and moves the next start. It stays the rollback for apps before 0.32.4,
  which never say `held`. On its own it leaves the kill switch unsafe for good, and a runtime that has
  to be stopped at once has no lever but a fresh start.
- **A request the page sends to ask whether the session is held.** It costs a new bridge message and a
  round trip on every boot of every page, and a shell before it would leave it unanswered — the same
  reading the absent field gives. The field is read before the page runs, with nothing to wait for.
- **Have the app answer the kill switch itself.** The app cannot see the web's build setting before the
  page runs, and a page that never asks never reaches the app.
- **Let a held offer override only the switch, not a contract mismatch.** A page that shares no
  contract cannot mirror, but booting its own runtime is the second owner this exists to prevent. The
  error screen, which reloads, is the outcome the unsettled path already gives.

## Consequences

- With an app from 0.32.4, a web deploy with the mirror off is a rollback that keeps each running
  process on one owner: pages in processes whose runtime holds the session go on mirroring it, and
  every new process is the page's.
- Apps from 0.32.1 to 0.32.3 never say `held`. While they are in use, roll back by naming `web` as the
  default owner and leaving the mirror on.
- A page whose contract the runtime no longer speaks shows the error screen in a held process instead
  of running its own session. It clears at the next start, which the page's default can move.
- The bridge is 2.35.0; the mini app SDK's `SDK_BRIDGE_VERSION` moves with it, with nothing new for a
  mini app.
