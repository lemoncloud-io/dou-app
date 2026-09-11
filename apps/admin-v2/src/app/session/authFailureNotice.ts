/**
 * `session/authFailureNotice.ts`
 * - Holds the one fact the console needs to show: the server has refused this session.
 *
 * A store rather than local state because the raiser is not a component — it is the reaction the
 * runtime calls from inside a failed HTTP request (`runtime.session.authFailureReaction`), which
 * can fire from any screen, during any query, with no React context to hand. `useSyncExternalStore`
 * is how the banner reads it; the store itself is plain and testable without rendering anything.
 */

/** Subscriber callback for `useSyncExternalStore`. */
type Listener = () => void;

class AuthFailureNotice {
    private raisedAt: number | null = null;
    private readonly listeners = new Set<Listener>();

    /**
     * Marks the session as refused. Repeat calls are ignored on purpose: a single expiry usually
     * fails several in-flight requests at once, and re-notifying would make the banner flicker
     * (and, in a `useSyncExternalStore` reader, re-render for no new information).
     */
    raise(): void {
        if (this.raisedAt != null) return;
        this.raisedAt = Date.now();
        this.listeners.forEach(listener => listener());
    }

    /** Back to normal — used by tests and by a future re-login that does not reload the page. */
    clear(): void {
        if (this.raisedAt == null) return;
        this.raisedAt = null;
        this.listeners.forEach(listener => listener());
    }

    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    /** A primitive, so the identity check `useSyncExternalStore` runs never reports a false change. */
    getSnapshot = (): boolean => this.raisedAt != null;
}

export const authFailureNotice = new AuthFailureNotice();
