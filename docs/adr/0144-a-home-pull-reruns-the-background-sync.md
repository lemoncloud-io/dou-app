# ADR-0144: A pull on home re-runs the background sync instead of fetching for itself

> Status: Accepted · Decided: 2026-09-30
> · Scope: `libs/web-ui-kit/src/composites/layout/PullToRefresh.tsx` ·
> `apps/web/src/app/runtime/backgroundRefresh.ts` · `apps/web/src/app/runtime/useBackgroundSync.ts` ·
> `apps/web/src/app/features/home/pages/HomePage.tsx`
> · The module docs are [apps/web home README](../../apps/web/docs/feature/home/README.md#pull-to-refresh),
> [apps/web data-flow.md](../../apps/web/docs/state/data-flow.md) and
> [libs/web-ui-kit README](../../libs/web-ui-kit/README.md)

## Context

Home had no way for a person to ask for fresh data. What it draws is kept current without one: the
global background sync re-reads the place list and the channel, profile and invite deltas on the
verified edge, every 60 seconds, on a return from the background and on a site switch, and the
header's cloud name and tier come from two queries of their own. The gap is the minute between
polls, and the moments a person has reason to doubt the screen — a room they were told about that
is not there yet.

The sync is mounted once, under `AppRuntime`, so it keeps running on every route. Home cannot call
into a hook mounted somewhere else, and home's own rule is that it owns no transport.

## Decision

**A pull on home runs the background sync's pass once, now, plus the two header queries.** Nothing
is fetched by a path that did not already exist.

- `useBackgroundSync` registers a handler in `app/runtime/backgroundRefresh.ts`; home calls
  `requestBackgroundRefresh()`, which settles when the pass has. With no runner mounted it settles
  at once.
- The pass is the verified edge's — lists plus the relay self channel — under the foreground
  signal's guards. Unverified or mid-switch, it sends nothing, because it would be answered by the
  wrong session.
- A request made while one is running joins it. Two passes read the same delta watermark, and the
  last to answer writes it back.
- The place snapshot, which the pass used to fire and forget, is awaited with the rest, so the
  spinner covers the place rail too. The automatic triggers ignore the returned promise, so for them
  nothing changes.
- The gesture is a kit component, `PullToRefresh`. The kit's rule that it holds no state now reads
  "no host state": a component may hold one gesture's state — as `BottomSheet` already held its drag
  — and the refresh that gesture started.

## Consequences

- **A pull re-reads lists, not message history.** Previews move when the chat sync home already
  registers catches a channel up to its new head; a pull does not fetch pages of messages itself.
- **An unverified or mid-switch pull only re-asks the header.** The spinner is short there, which
  is honest — nothing else was sent.
- **The spinner stops at 10 seconds, the work does not.** A socket that is dead but not yet known to
  be would otherwise hold it for the SDK's 30-second request timeout, and block another pull for as
  long.
- **The registration slot is module state.** One handler at a time, which fits a sync that is
  mounted once; a second runner would take the slot from the first.
- **The gesture is touch-only.** A mouse drag on a desktop browser does nothing.

## Alternatives

- **A fetch of home's own.** Rejected: it would duplicate the pass — watermarks, the invite skip,
  the self-channel gate — in a second place that could drift from the first, and home owns no
  transport.
- **A React context from `AppRuntime`.** It works, but every consumer of the context re-renders
  when the sync's callbacks change, to reach a function that only a gesture calls.
- **The WebView's own `pullToRefreshEnabled`.** Rejected: it reloads the whole page, which throws
  away the socket, the caches and the scroll position to get what one sync pass gives.
- **A controlled `refreshing` prop on the kit component.** It would keep the kit strictly
  stateless, but every host would then have to track the promise the component already has.
