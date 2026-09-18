import { recordRoute } from '../utils/routeTrail';
import { readHistoryIndex } from './stackDepth';
import { asHistoryAction, resolveTransitionIndex, routeStackTracker, type RouteHistoryAction } from './stackTracker';

/** What a transition looked like, as far as "does the screen still mean the same thing" cares. */
export interface ObservedTransition {
    pathname: string;
    action: RouteHistoryAction;
}

/**
 * Does this transition retire the transient UI that was on screen?
 *
 * Pure, and separate from the notifying so the rule can be read as a rule. The question it answers
 * is narrow: has the reader gone somewhere, such that a banner raised for the previous screen is no
 * longer about what they are looking at.
 *
 * - POP retires it. This is the reported symptom exactly: going back left the banner sitting there.
 * - PUSH and REPLACE retire it when the pathname changes. A redirect chain ends in a REPLACE onto a
 *   different screen, and that arrival is as much a move as a push is.
 * - REPLACE onto the SAME pathname does not. That is a query being normalised or a filter being
 *   written to the URL — the screen did not change, and dismissing there would eat a banner that
 *   arrived a moment ago.
 * - The first record does not, because nothing can have been raised yet.
 */
export const shouldDismissTransientUi = (previous: ObservedTransition | null, next: ObservedTransition): boolean => {
    if (previous === null) return false;
    if (next.action === 'POP') return true;
    return next.pathname !== previous.pathname;
};

/**
 * Callbacks to run when a transition retires transient UI.
 *
 * The module does not dismiss anything itself — it does not import `sonner` and must not. It owns
 * the moment; the presentation layer owns what to do with it, and registers here. A Set so a
 * double-mount registers once, and so unregistering is exact.
 */
const transitionListeners = new Set<() => void>();

/** Registers a listener and returns its unsubscribe. */
export const onTransientUiTransition = (listener: () => void): (() => void) => {
    transitionListeners.add(listener);
    return () => transitionListeners.delete(listener);
};

/** Test-only: the registry is module state shared across a file. */
export const resetTransientUiListeners = (): void => transitionListeners.clear();

/**
 * Structural shape of the data router, kept local so this module needs no react-router import.
 * `historyAction` is typed as `string` (not the router's enum) and narrowed by `asHistoryAction`.
 */
interface ObservedRouterState {
    location: { pathname: string };
    historyAction: string;
}

export interface ObservableRouter {
    state: ObservedRouterState;
    subscribe(listener: (state: ObservedRouterState) => void): () => void;
}

/**
 * Feeds both route observers from one router subscription.
 *
 * Two stores, because they answer different questions: the trail is where the user has BEEN
 * (attached to feedback reports so a bug reported on one screen carries how they got there), the
 * stack is what is BEHIND them right now (what the back button will do). `/a → /b → back → /c`
 * leaves a trail of `a, b, c` and a stack of `a, c`.
 *
 * Subscribing to the data router — rather than a `useLocation` runner — is the only option here:
 * AppRuntime and the debug overlay both sit ABOVE RouterProvider, so there is no router context to
 * hook into outside the component that creates the router.
 *
 * Returns the unsubscribe function.
 */
export const observeRouterRoutes = (router: ObservableRouter): (() => void) => {
    // The previous transition, which is what makes "did the screen change" answerable here. Null
    // until the first record, which is also what marks that first record as not a move.
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

    // `subscribe` does not replay the current state, hence the explicit first record. It is recorded
    // as a POP so it lands on whatever index the tab is already at without a +1: the router has
    // finished initializing by now, so `history.state.idx` is current rather than one behind.
    record({ location: router.state.location, historyAction: 'POP' });

    return router.subscribe(record);
};
