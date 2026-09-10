import { recordRoute } from '../utils/routeTrail';
import { asHistoryAction, readHistoryIndex, resolveTransitionIndex, routeStackTracker } from '../utils/routeStack';

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
    const record = (state: ObservedRouterState): void => {
        const { pathname } = state.location;
        const action = asHistoryAction(state.historyAction);

        recordRoute(pathname);
        routeStackTracker.record({ pathname, action, index: resolveTransitionIndex(action, readHistoryIndex()) });
    };

    // `subscribe` does not replay the current state, hence the explicit first record. It is recorded
    // as a POP so it lands on whatever index the tab is already at without a +1: the router has
    // finished initializing by now, so `history.state.idx` is current rather than one behind.
    record({ location: router.state.location, historyAction: 'POP' });

    return router.subscribe(record);
};
