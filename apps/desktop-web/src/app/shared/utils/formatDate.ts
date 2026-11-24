import i18next from 'i18next';

const locale = (): string | undefined => i18next.language || undefined;

const valid = (ms: number | undefined): Date | null => {
    if (!ms) return null;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
};

export const formatClockTime = (ms: number | undefined): string =>
    valid(ms)?.toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' }) ?? '';

export const formatHourMinute = (hhmm: string): string => {
    const minutes = parseHourMinute(hhmm);
    if (minutes == null) return hhmm;
    const date = new Date();
    date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return date.toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
};

export const parseHourMinute = (hhmm: string): number | null => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
};

export const formatShortDate = (ms: number | undefined): string => {
    const date = valid(ms);
    if (!date) return '';
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString(
        locale(),
        sameYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' }
    );
};

export const formatLongDate = (ms: number | undefined): string =>
    valid(ms)?.toLocaleDateString(locale(), { year: 'numeric', month: 'long', day: 'numeric' }) ?? '';

export const formatFullDate = (ms: number | undefined): string =>
    valid(ms)?.toLocaleDateString(locale(), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) ?? '';

export const formatDayHeading = (ms: number | undefined): string => {
    const date = valid(ms);
    if (!date) return '';
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString(locale(), {
        ...(sameYear ? {} : { year: 'numeric' }),
        month: 'long',
        day: 'numeric',
        weekday: 'long',
    });
};

export const formatListTime = (ms: number | undefined): string => {
    const date = valid(ms);
    if (!date) return '';
    return date.toDateString() === new Date().toDateString() ? formatClockTime(ms) : formatShortDate(ms);
};
