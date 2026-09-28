/**
 * Monotonic-ish clock for durations.
 *
 * `performance.now()` where it exists (both the WebView and Hermes have it), so
 * a wall-clock adjustment mid-measurement cannot produce a negative duration.
 * Only differences are ever taken, so the two sources never have to agree on an
 * origin.
 */
export const perfNow = (): number =>
    typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
