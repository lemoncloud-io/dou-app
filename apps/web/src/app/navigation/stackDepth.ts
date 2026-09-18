/**
 * How deep the app sits in its own history, and whether there is anything behind it.
 *
 * The one place allowed to answer "can we go back?". Split out from the tracker because the two
 * have different readers: the tracker reconstructs the whole stack for the debug overlay, while
 * everything that decides something — leaving the login screen, consuming a native back press —
 * only needs this single boolean.
 */

/**
 * Reads the router's index for the current history entry.
 *
 * Kept as its own function so callers stay pure and the jsdom plumbing is tested on its own.
 */
export const readHistoryIndex = (): number | null => {
    if (typeof window === 'undefined') return null;
    const state = window.history.state as { idx?: unknown } | null;
    return typeof state?.idx === 'number' ? state.idx : null;
};

/**
 * Whether there is an entry inside the app to go back to.
 *
 * Deliberately not `window.history.length`. That is a browser-global counter that only grows for as
 * long as the WebView lives, so it also counts entries a redirect replaced, pages visited outside
 * the app, and whatever an earlier session left behind — a WebView that has been alive a while
 * reports "yes, you can go back" on the app's very first screen. The router instead writes its own
 * index into every entry and back-fills `idx: 0` when it initialises (see `stackTracker`'s header),
 * so index 0 means the app's first screen and nothing else.
 *
 * Unreadable means false. An index we cannot read means something called `history.pushState` past
 * the router, and rewinding to a place we cannot locate is worse than not rewinding at all.
 *
 * One cost is accepted here. After a full reload lands mid-stack, the index survives in the entry's
 * state but the entries behind it belong to a document that is gone, so going back is a real page
 * load — a boot and a white flash, not an in-app transition. The shell reloads the WebView on
 * resume and on update, so this is reachable. It is still the better answer: the alternative is a
 * back button that does nothing at all on every screen after a reload.
 */
export const canGoBackInApp = (): boolean => (readHistoryIndex() ?? 0) > 0;
