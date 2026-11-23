export const readHistoryIndex = (): number | null => {
    if (typeof window === 'undefined') return null;
    const state = window.history.state as { idx?: unknown } | null;
    return typeof state?.idx === 'number' ? state.idx : null;
};

export const canGoBackInApp = (): boolean => (readHistoryIndex() ?? 0) - rewindsInFlight > 0;

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

export const noteRewindStarted = (): void => {
    if (rewindsInFlight === 0) window.addEventListener('popstate', onRewindLanded);
    rewindsInFlight += 1;
    clearTimeout(forgetRewinds);
    forgetRewinds = setTimeout(stopTrackingRewinds, REWIND_LANDING_LIMIT_MS);
};
