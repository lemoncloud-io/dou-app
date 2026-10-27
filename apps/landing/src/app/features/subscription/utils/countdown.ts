/** Whole seconds from `nowMs` until an ISO instant, never below zero. */
export const secondsUntil = (iso: string, nowMs: number): number =>
    Math.max(0, Math.ceil((Date.parse(iso) - nowMs) / 1000));

/** `04:42` — minutes and seconds, as a code's remaining lifetime is shown. */
export const formatMinutesSeconds = (seconds: number): string =>
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

/** `14:05` — the local time of day of an ISO instant, for "try again after …". */
export const formatTimeOfDay = (iso: string): string => {
    const date = new Date(iso);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
