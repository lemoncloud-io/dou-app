/**
 * Calendar-date arithmetic on ISO dates (`2026-11-20`).
 *
 * Billing happens on days, not instants, so everything here works on the date part and treats it as
 * a plain calendar day — no time zone enters the sum. "Today" comes in as a `Date` and is read in the
 * browser's local calendar, the day the reader is looking at.
 */

const MS_PER_DAY = 86_400_000;

const pad = (n: number): string => String(n).padStart(2, '0');

/** The reader's local calendar day for an instant. */
export const toIsoDate = (date: Date): string =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const parts = (iso: string): [number, number, number] => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return [y, m, d];
};

/** Days since the epoch for a calendar date — only meaningful as a difference. */
export const dayNumber = (iso: string): number => {
    const [y, m, d] = parts(iso);
    return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
};

export const addDays = (iso: string, days: number): string => {
    const [y, m, d] = parts(iso);
    const next = new Date(Date.UTC(y, m - 1, d + days));
    return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
};

/**
 * The same day `months` later, held to the last day of a shorter month: a subscription billed on the
 * 31st renews on 30 November, then 31 December.
 */
export const addMonths = (iso: string, months: number, billingDay?: number): string => {
    const [y, m, d] = parts(iso);
    const day = billingDay ?? d;
    const first = new Date(Date.UTC(y, m - 1 + months, 1));
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(Math.min(day, lastDay))}`;
};
