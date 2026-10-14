import i18next from 'i18next';

/**
 * Dates and times in the app's language, not the browser's. Every formatter here
 * used to pass an empty locale list, so a fully Korean UI printed "June 15, 2026"
 * and "12:24 PM" beside a translated "오늘". Read at call time: components that
 * render these already re-render on a language change through `useTranslation`.
 */
const locale = (): string | undefined => i18next.language || undefined;

const valid = (ms: number | undefined): Date | null => {
    if (!ms) return null;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
};

/** "12:24 PM" / "오후 12:24". */
export const formatClockTime = (ms: number | undefined): string =>
    valid(ms)?.toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' }) ?? '';

/**
 * A "HH:MM" 24h input on the locale clock ("22:00" → "10:00 PM" / "오후 10:00"):
 * the quiet-hours window prints the same clock the snooze label uses, instead
 * of raw 24h strings beside it. A malformed input comes back untouched.
 */
export const formatHourMinute = (hhmm: string): string => {
    const minutes = parseHourMinute(hhmm);
    if (minutes == null) return hhmm;
    const date = new Date();
    date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return date.toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
};

/**
 * "HH:MM" 24h input → minutes past midnight, or null when malformed. One parser
 * for the quiet-hours inputs, the DND check and the clock print above.
 */
export const parseHourMinute = (hhmm: string): number | null => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
};

/** "Jun 15" / "6월 15일", with the year only when it is not this year. */
export const formatShortDate = (ms: number | undefined): string => {
    const date = valid(ms);
    if (!date) return '';
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString(
        locale(),
        sameYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' }
    );
};

/** "June 15, 2026" / "2026년 6월 15일". */
export const formatLongDate = (ms: number | undefined): string =>
    valid(ms)?.toLocaleDateString(locale(), { year: 'numeric', month: 'long', day: 'numeric' }) ?? '';

/**
 * When something in a list happened: the clock time today, the short date before. A list of
 * today's activity read "Oct 13" on every row, which tells the rows apart by nothing.
 */
export const formatListTime = (ms: number | undefined): string => {
    const date = valid(ms);
    if (!date) return '';
    return date.toDateString() === new Date().toDateString() ? formatClockTime(ms) : formatShortDate(ms);
};
