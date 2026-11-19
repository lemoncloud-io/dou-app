/**
 * The longest a page transition waits for its destination before the browser captures it anyway.
 *
 * The page does not paint while it waits — the reader is looking at the screen they tapped on — so
 * this is a ceiling on that freeze, not a typical wait. A destination React has in hand renders in
 * one task, tens of milliseconds even on a slow phone. The ceiling only matters when no render comes
 * at all: `navigate(-1)` with nothing behind it, or a navigation to the screen already shown.
 */
export const DESTINATION_WAIT_CAP_MS = 300;

export interface WaitForDestinationOptions {
    /**
     * The navigation moves through history (`navigate(-1)`). Its destination is not on the page until
     * the browser has moved to the other entry, a task or more later, so DOM changes made while the
     * entry is still the one being left are not counted.
     */
    traversal: boolean;
    capMs?: number;
}

/**
 * Resolves once the page has rendered the destination of a navigation that is about to start, or
 * once `capMs` has passed. Call it BEFORE navigating, so the render cannot be missed, and return its
 * promise from the view transition's update callback.
 *
 * Why it exists: the browser captures the incoming screen as soon as the update callback settles.
 * React renders a route change after the navigation call returns, so a callback that only calls
 * `navigate` settles while the old screen is still in the DOM. For a back navigation that is certain
 * — the router does not even hear about it until the browser has moved entries — and the first frames
 * show the leaving screen sliding over a copy of itself. For a push it depends on whether React's
 * render wins the race to the next frame, which a busy phone loses.
 *
 * "Rendered" is read from the DOM rather than from React or the router: the first change to the
 * document's tree after the navigation. React commits a route change in one synchronous pass and
 * MutationObserver reports after that pass, so what is captured is the committed route, unless an
 * unrelated change (a message arriving, a toast) lands first — in which case the capture is as early
 * as it always was. A lazy screen whose code is not loaded yet commits its Suspense fallback first,
 * and that fallback is what gets captured.
 *
 * For a traversal, "after the navigation" means after the history entry changed, read from
 * `history.state` — not from the `popstate` event. The router's own `popstate` listener runs first and
 * React commits the route in the microtasks right after it, so by the time a listener of ours ran,
 * the mutation it was waiting for would already have been reported and dropped. The router writes a
 * fresh state object into every entry it creates, and the browser has switched to the other entry's
 * object before `popstate` fires, so comparing identities tells the two entries apart.
 */
export const waitForDestination = ({ traversal, capMs = DESTINATION_WAIT_CAP_MS }: WaitForDestinationOptions) =>
    new Promise<void>(resolve => {
        const leaving: unknown = window.history.state;
        let settled = false;

        const observer = new MutationObserver(() => {
            if (!traversal || window.history.state !== leaving) finish();
        });
        const timer = setTimeout(() => finish(), capMs);

        function finish() {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            observer.disconnect();
            resolve();
        }

        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
