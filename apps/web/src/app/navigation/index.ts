/**
 * The app's history stack — what a screen arrival does to it, and what a back press does with it.
 *
 * This file is the whole of what the rest of the app may use. The module is several files because
 * the split is load-bearing, not because the concern is: only `useStackNavigate` and `useStackBack`
 * may touch the router, and everything else is pure. A grep over this directory is what enforces
 * that, and it only works while those are separate files. Importing a concrete path from outside
 * bypasses nothing, but it does tie a caller to an arrangement that exists for the module's sake
 * rather than the caller's — so callers come through here.
 *
 * The three questions it answers, and nothing else:
 *
 *   1. How should this arrival go onto the stack?   `useStackNavigate`
 *   2. Is there anywhere to go back to?             `canGoBackInApp`
 *   3. Did the app consume this back press?         `useStackBack`
 *
 * Question 1 has one input that is not about the arrival itself: some features are a GRAPH of
 * screens about one thing (a channel's room, settings, invite and threads), and entering a second
 * channel has to put the first channel's whole graph away rather than stack on top of it.
 * `featureGraph` names those graphs and `stackPolicy` acts on them; ADR-0110 is the decision.
 *
 * Four things deliberately stay OUTSIDE. Overlay detection belongs to whoever draws overlays, so
 * `useStackBack` is told whether one is open rather than looking. Toast dismissal belongs to the
 * presentation layer, which registers through `onTransientUiTransition`. Cloud and site switching
 * belongs to the session layer, and `usePushNavigate` keeps it. And `utils/routeTrail` answers a
 * different question — where the reader has BEEN, not what is BEHIND them — which is why the
 * feedback report and the log context read it without depending on any of this.
 */

// 1 — going forward.
export { useStackNavigate } from './useStackNavigate';
export type { EntryAction, EntryContext, EntryKind } from './stackPolicy';

// What a screen is PART OF, which question 1 needs before it can put a whole feature away at once.
// Exported for the debug overlay and for tests; nothing else in the app should need to ask.
export { countGraphRun, isSiblingGraphEntry, readFeatureGraph } from './featureGraph';
export type { FeatureGraphNode } from './featureGraph';

// 2 — how deep we are.
export { canGoBackInApp, readHistoryIndex } from './stackDepth';

// 3 — going back.
export { useStackBack } from './useStackBack';
export type { BackInput, BackOutcome } from './useStackBack';

// Observation: one router subscription, mounted by the composition root, feeding the tracker the
// debug overlay reads and the transition listeners the toast layer registers.
export { observeRouterRoutes, onTransientUiTransition } from './stackObserver';
export type { ObservableRouter, ObservedTransition } from './stackObserver';
export { routeStackTracker } from './stackTracker';
export type { RouteHistoryAction, RouteStackEntry, RouteStackSnapshot } from './stackTracker';
