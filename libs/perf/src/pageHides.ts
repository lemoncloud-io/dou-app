/**
 * How many times the page has been hidden since this module started watching.
 *
 * For a measurement that must not include time the page spent hidden: take the count when it starts,
 * compare when it ends, and drop it if the count moved. A count rather than a timestamp, so it needs
 * no clock and cannot disagree with whichever clock the measurement uses.
 *
 * The listener is attached on the first call. A measurement starts by asking, and one that starts
 * while the page is already hidden is refused by its own visibility check, so a hide before the first
 * call is never one that matters. Where there is no document — a native runtime, a test without
 * jsdom — the count stays at zero.
 */
let hides = 0;
let watching = false;

export const pageHideCount = (): number => {
    if (!watching && typeof document !== 'undefined') {
        watching = true;
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') hides += 1;
        });
    }
    return hides;
};

/** Whether the page is hidden right now. False where there is no document. */
export const isPageHidden = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'hidden';
