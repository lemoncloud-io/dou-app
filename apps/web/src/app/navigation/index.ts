export { useStackNavigate } from './useStackNavigate';
export type { EntryAction, EntryContext, EntryKind } from './stackPolicy';

export { countGraphRun, isSiblingGraphEntry, readFeatureGraph } from './featureGraph';
export type { FeatureGraphNode } from './featureGraph';

export { canGoBackInApp, readHistoryIndex } from './stackDepth';

export { backIsTheAppsToSpend, useStackBack } from './useStackBack';
export type { BackInput, BackOutcome } from './useStackBack';

export { observeRouterRoutes, onTransientUiTransition } from './stackObserver';
export type { ObservableRouter, ObservedTransition } from './stackObserver';
export { routeStackTracker } from './stackTracker';
export type { RouteHistoryAction, RouteStackEntry, RouteStackSnapshot } from './stackTracker';
