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
