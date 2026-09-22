/**
 * Letting an open menu finish leaving before the screen under it changes.
 *
 * A dropdown item that navigates has two animations to run and no opinion about their order, so
 * they run together and look like neither. Radix closes the menu on select and its exit keyframe
 * takes about 150ms; `useNavigateWithTransition` reaches for the View Transitions API in the same
 * tick, and the API's first act is to snapshot the outgoing document — which still has the menu in
 * it. The menu is therefore painted into the old page and slides away WITH it, as part of the
 * screen it was supposed to be dismissed from.
 *
 * Sequencing them is the whole fix: the menu goes, then the screen changes. Nothing here knows
 * about routing — it waits, and the caller navigates.
 *
 * What it waits FOR is the menu leaving the DOM, not an `animationend`. At the moment a menu item's
 * `onClick` runs, Radix has not closed anything yet — the exit keyframe starts a tick later — so a
 * listener attached here would be waiting on an animation that has not been declared, and on some
 * paths would catch the tail of the ENTER animation instead. Unmounting is the one signal that
 * means the same thing however the menu got closed, and Radix only unmounts once its exit has
 * finished playing.
 */

/**
 * The longest this will ever hold a navigation.
 *
 * A ceiling and not the wait itself. The menu's removal is the real signal, but it never comes for
 * a menu that is kept mounted, under `prefers-reduced-motion` where the keyframe resolves to
 * nothing, or if Radix changes how Presence unmounts — and a tap that silently does nothing is far
 * worse than one that transitions imperfectly. Comfortably above Radix's ~150ms exit without being
 * a delay anyone would notice if it were ever actually spent.
 */
export const MENU_EXIT_TIMEOUT_MS = 260;

/** Every Radix overlay that closes on select and would otherwise be caught in the snapshot. */
const CLOSING_MENU_SELECTOR = '[role="menu"], [role="listbox"]';

export interface WaitForMenuDismissalOptions {
    /** Injected for tests; defaults to the live document. */
    root?: Document;
    timeoutMs?: number;
}

/**
 * Resolves once no menu is on screen any more, or once the ceiling is reached.
 *
 * Resolves IMMEDIATELY when there is no menu, which is the common case for every caller that is
 * not a menu item — so this is safe to put in front of a navigation without first asking whether a
 * menu was involved.
 */
export const waitForMenuDismissal = ({
    root,
    timeoutMs = MENU_EXIT_TIMEOUT_MS,
}: WaitForMenuDismissalOptions = {}): Promise<void> => {
    const doc = root ?? (typeof document === 'undefined' ? undefined : document);
    if (!doc || !doc.querySelector(CLOSING_MENU_SELECTOR)) return Promise.resolve();

    return new Promise<void>(resolve => {
        let settled = false;
        const settle = () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            observer.disconnect();
            resolve();
        };

        // The ceiling is armed before the observer so a menu that never unmounts — for any of the
        // reasons above — cannot strand the navigation behind it.
        const timer = window.setTimeout(settle, timeoutMs);
        const observer = new MutationObserver(() => {
            if (!doc.querySelector(CLOSING_MENU_SELECTOR)) settle();
        });
        observer.observe(doc.body, { childList: true, subtree: true });
    });
};
