/**
 * Reconstructed browser history stack for the debug overlay.
 *
 * Distinct from [[routeTrail]], which is a chronological list of visited paths. A trail cannot
 * answer "what is behind me right now": `/a → /b → back → /c` leaves a trail of `a, b, c` while
 * the actual stack is `a, c`. Diagnosing back-button behaviour needs the latter.
 *
 * The browser exposes no way to enumerate history entries, so the stack is rebuilt from two things
 * react-router already maintains:
 *  - `window.history.state.idx` — the router writes its own index into every history entry
 *    (`getHistoryState` in @remix-run/router) and back-fills `idx: 0` on init, so index 0 is the
 *    app's first entry regardless of what the tab visited earlier.
 *  - the history action of each transition (PUSH discards the forward branch, REPLACE overwrites
 *    in place, POP only moves the cursor).
 *
 * SECURITY: as with the trail, callers pass `pathname` ONLY. Query strings carry capability tokens
 * (`/invite/accept?...`, `/s?...`). This store is overlay-local today, but keeping the same rule
 * means it can never leak by being wired into a report later.
 */

/** History action of a transition. Mirrors react-router's `HistoryAction` without importing it. */
export type RouteHistoryAction = 'PUSH' | 'POP' | 'REPLACE';

export interface RouteStackTransition {
    pathname: string;
    action: RouteHistoryAction;
    /** `window.history.state.idx`; null when it cannot be read (see `readHistoryIndex`). */
    index: number | null;
}

export interface RouteStackEntry {
    /** History index, which is also the entry's depth from the app's first entry. */
    index: number;
    /**
     * Null for an entry that exists in the browser's history but was never observed here — the
     * stack below where a full page reload landed. Reporting it as unknown is the point: it says
     * "there is more behind you than this list shows" instead of implying the stack starts here.
     */
    pathname: string | null;
    isCurrent: boolean;
}

export interface RouteStackSnapshot {
    entries: RouteStackEntry[];
    /** Index of the entry the user is on, or null before the first transition is recorded. */
    currentIndex: number | null;
    /**
     * False once a transition arrived without a readable index, which means the stack cannot be
     * trusted. Happens when something calls `history.pushState` directly, bypassing the router.
     */
    isIndexed: boolean;
}

export interface IRouteStackTracker {
    record(transition: RouteStackTransition): void;
    getSnapshot(): RouteStackSnapshot;
    /** Test-only reset — the tracker is module state shared across a test file. */
    reset(): void;
}

/**
 * Reads the router's index for the current history entry.
 *
 * Kept separate from `record` so the tracker stays a pure function of its input and the jsdom
 * plumbing is tested on its own.
 */
export const readHistoryIndex = (): number | null => {
    if (typeof window === 'undefined') return null;
    const state = window.history.state as { idx?: unknown } | null;
    return typeof state?.idx === 'number' ? state.idx : null;
};

/**
 * Resolves the history index a transition lands on, given the index readable at the moment the
 * router notifies its subscribers.
 *
 * The router notifies BEFORE it writes the new history entry: in `completeNavigation`,
 * `updateState` (which calls subscribers) runs ahead of `init.history.push`. So a PUSH is observed
 * while `history.state.idx` still holds the PREVIOUS entry's index — hence the +1. A REPLACE keeps
 * the index it overwrites. A POP is different again: the browser moves the cursor before the router
 * hears `popstate`, so the readable index is already the destination.
 *
 * That ordering is a router internal, which is why `routeObserver.integration.test` drives a real
 * router instead of trusting this comment. That suite is what fails if an upgrade reorders the two.
 */
export const resolveTransitionIndex = (action: RouteHistoryAction, readableIndex: number | null): number | null => {
    if (readableIndex === null) return null;
    return action === 'PUSH' ? readableIndex + 1 : readableIndex;
};

/**
 * Narrows the router's history action.
 *
 * Unknown values fall back to POP because POP is the only action that changes nothing about the
 * stack's shape — it just moves the cursor. Guessing PUSH would discard the forward branch.
 */
export const asHistoryAction = (value: string): RouteHistoryAction =>
    value === 'PUSH' || value === 'REPLACE' ? value : 'POP';

class RouteStackTracker implements IRouteStackTracker {
    /** Indexed by history index, so a hole is a real gap in what we observed, not a missing push. */
    private entries: (string | null)[] = [];
    private currentIndex: number | null = null;
    private isIndexed = true;

    /**
     * The array mirrors the browser's own history depth, which the browser itself bounds, so it
     * cannot grow unless the real history does. No separate cap: capping would have to drop from
     * the front, and the index IS the array position — an offset would make every displayed depth
     * a lie.
     */
    record({ pathname, action, index }: RouteStackTransition): void {
        if (!pathname) return;

        if (index === null) {
            this.isIndexed = false;
            return;
        }

        // A push invalidates everything ahead of it, exactly as it does in the browser.
        if (action === 'PUSH' && this.entries.length > index) this.entries.length = index;

        // Landing above the known depth means the entries below were never observed — a reload
        // mid-stack. Mark them unknown rather than silently renumbering this one to 0.
        while (this.entries.length < index) this.entries.push(null);

        this.entries[index] = pathname;
        this.currentIndex = index;
    }

    getSnapshot(): RouteStackSnapshot {
        return {
            entries: this.entries.map((pathname, index) => ({
                index,
                pathname,
                isCurrent: index === this.currentIndex,
            })),
            currentIndex: this.currentIndex,
            isIndexed: this.isIndexed,
        };
    }

    reset(): void {
        this.entries = [];
        this.currentIndex = null;
        this.isIndexed = true;
    }
}

export const routeStackTracker: IRouteStackTracker = new RouteStackTracker();
