import { recordRoute } from '../utils/routeTrail';
import { readHistoryIndex } from './stackDepth';
import { asHistoryAction, resolveTransitionIndex, routeStackTracker, type RouteHistoryAction } from './stackTracker';

export interface ObservedTransition {
    pathname: string;
    action: RouteHistoryAction;
}

export const shouldDismissTransientUi = (previous: ObservedTransition | null, next: ObservedTransition): boolean => {
    if (previous === null) return false;
    if (next.action === 'POP') return true;
    return next.pathname !== previous.pathname;
};

const transitionListeners = new Set<() => void>();

export const onTransientUiTransition = (listener: () => void): (() => void) => {
    transitionListeners.add(listener);
    return () => transitionListeners.delete(listener);
};

export const resetTransientUiListeners = (): void => transitionListeners.clear();

interface ObservedRouterState {
    location: { pathname: string };
    historyAction: string;
}

export interface ObservableRouter {
    state: ObservedRouterState;
    subscribe(listener: (state: ObservedRouterState) => void): () => void;
}

export const observeRouterRoutes = (router: ObservableRouter): (() => void) => {
    let previous: ObservedTransition | null = null;

    const record = (state: ObservedRouterState): void => {
        const { pathname } = state.location;
        const action = asHistoryAction(state.historyAction);

        recordRoute(pathname);
        routeStackTracker.record({ pathname, action, index: resolveTransitionIndex(action, readHistoryIndex()) });

        const next: ObservedTransition = { pathname, action };
        if (shouldDismissTransientUi(previous, next)) transitionListeners.forEach(listener => listener());
        previous = next;
    };

    record({ location: router.state.location, historyAction: 'POP' });

    return router.subscribe(record);
};
