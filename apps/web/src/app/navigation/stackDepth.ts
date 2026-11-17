/**
 * How deep the app sits in its own history, and whether there is anything behind it.
 *
 * The one place allowed to answer "can we go back?". Split out from the tracker because the two
 * have different readers: the tracker reconstructs the whole stack for the debug overlay and for
 * the two stack-policy rules that look below the top, while most decisions — leaving the login
 * screen, consuming a native back press — only need this single boolean.
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
 * Rewinds that were started but have not reached their entry yet are subtracted (`noteRewindStarted`).
 * The index only changes once the browser has moved, and a rewind that plays a page transition moves
 * a frame or more after it was asked for; two back presses inside that window would otherwise both
 * read index 1 and the second would step out of the app.
 *
 * One cost is accepted here. After a full reload lands mid-stack, the index survives in the entry's
 * state but the entries behind it belong to a document that is gone, so going back is a real page
 * load — a boot and a white flash, not an in-app transition. The shell reloads the WebView on
 * resume and on update, so this is reachable. It is still the better answer: the alternative is a
 * back button that does nothing at all on every screen after a reload.
 */
export const canGoBackInApp = (): boolean => (readHistoryIndex() ?? 0) - rewindsInFlight > 0;

/**
 * How long a started rewind may go without its `popstate` before it stops counting. A rewind lands
 * well inside this (the page transition waits at most 300ms before it navigates); the limit only
 * exists so that a rewind the browser never carried out cannot leave back refusing forever — a
 * refusal the shell reads as "the app is done with back" and may answer by closing the app.
 */
const REWIND_LANDING_LIMIT_MS = 1000;

let rewindsInFlight = 0;
let forgetRewinds: ReturnType<typeof setTimeout> | undefined;

const onRewindLanded = () => {
    rewindsInFlight = Math.max(0, rewindsInFlight - 1);
    if (rewindsInFlight === 0) stopTrackingRewinds();
};

const stopTrackingRewinds = () => {
    rewindsInFlight = 0;
    clearTimeout(forgetRewinds);
    window.removeEventListener('popstate', onRewindLanded);
};

/**
 * Records a one-entry rewind that has been asked for and not yet carried out, so `canGoBackInApp`
 * answers for where the app is about to be. Each `popstate` settles one of them.
 */
export const noteRewindStarted = (): void => {
    if (rewindsInFlight === 0) window.addEventListener('popstate', onRewindLanded);
    rewindsInFlight += 1;
    clearTimeout(forgetRewinds);
    forgetRewinds = setTimeout(stopTrackingRewinds, REWIND_LANDING_LIMIT_MS);
};
