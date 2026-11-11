/**
 * `lib/report-logs/period.ts`
 * - The period buttons: what each one means as an instant range, and which days the server is
 *   asked for to cover it.
 *
 * The server filters by whole days only — `from`/`to` are `YYYY-MM-DD`, Korean days, matched on
 * arrival time. "Last hour" cannot be said to it. So every period resolves to two things: the
 * exact window the screen shows (`fromMs`/`toMs`, narrowed in the browser by occurrence time),
 * and the covering days the server is asked for (`fromDate`/`toDate`). For the day-shaped
 * periods the two coincide; for the rolling ones (`1h`, `24h`, `around`) the days are wider, and
 * `exact` says so, so a server count over the days is never presented as a count over the hour.
 *
 * Korean time has no daylight saving, so a fixed nine-hour offset is the whole conversion.
 */

export const PERIOD_PRESETS = ['1h', '24h', 'today', 'yesterday', '7d', 'custom'] as const;

/** `around` is not a button: it is what "show this user's logs at that time" sets. */
export type PeriodPreset = (typeof PERIOD_PRESETS)[number] | 'around';

export interface PeriodInput {
    preset: PeriodPreset;
    /** `custom` only: first and last day, `YYYY-MM-DD`. */
    from?: string;
    to?: string;
    /** `around` only: the instant the window is centred on, epoch ms. */
    at?: number;
}

export interface ResolvedPeriod {
    preset: PeriodPreset;
    fromMs: number;
    toMs: number;
    /** Covering days for the server, inclusive. */
    fromDate: string;
    toDate: string;
    /** True when the covering days are exactly the window, so a server count over them is a count over it. */
    exact: boolean;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Half-width of the `around` window. */
export const AROUND_HALF_MS = 30 * 60 * 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The Korean calendar day an instant falls on. */
export const kstDate = (ms: number): string => new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);

/** First instant of a Korean day. */
export const kstDayStart = (date: string): number => Date.parse(`${date}T00:00:00.000+09:00`);

/** Last instant of a Korean day. */
export const kstDayEnd = (date: string): number => kstDayStart(date) + DAY_MS - 1;

const isDate = (value?: string): value is string => !!value && DATE_RE.test(value) && !Number.isNaN(kstDayStart(value));

const spanOf = (preset: PeriodPreset, fromMs: number, toMs: number, exact: boolean): ResolvedPeriod => ({
    preset,
    fromMs,
    toMs,
    fromDate: kstDate(fromMs),
    toDate: kstDate(toMs),
    exact,
});

/**
 * Resolve a period against `now`.
 *
 * A `custom` period with a missing or malformed day, or an `around` with no instant, falls back
 * to today rather than to an open range: an open range would quietly become "the newest rows of
 * all time", which is not what anyone pressing a period button asked for.
 */
export const resolvePeriod = (input: PeriodInput, now: number): ResolvedPeriod => {
    const today = kstDate(now);
    switch (input.preset) {
        case '1h':
            return spanOf('1h', now - HOUR_MS, now, false);
        case '24h':
            return spanOf('24h', now - DAY_MS, now, false);
        case 'yesterday': {
            const day = kstDate(kstDayStart(today) - 1);
            return spanOf('yesterday', kstDayStart(day), kstDayEnd(day), true);
        }
        case '7d':
            return spanOf('7d', kstDayStart(today) - 6 * DAY_MS, now, true);
        case 'custom': {
            if (!isDate(input.from) && !isDate(input.to)) break;
            const from = isDate(input.from) ? input.from : (input.to as string);
            const to = isDate(input.to) ? input.to : from;
            // A reversed range is read the way it was obviously meant.
            const [first, last] = from <= to ? [from, to] : [to, from];
            return spanOf('custom', kstDayStart(first), kstDayEnd(last), true);
        }
        case 'around': {
            if (input.at === undefined || !Number.isFinite(input.at)) break;
            return spanOf('around', input.at - AROUND_HALF_MS, input.at + AROUND_HALF_MS, false);
        }
        default:
            break;
    }
    return spanOf('today', kstDayStart(today), now, true);
};

/** The next wider preset, for the empty state's "widen the period" button. `undefined` at the widest. */
export const widerPreset = (preset: PeriodPreset): PeriodPreset | undefined => {
    switch (preset) {
        case '1h':
        case 'around':
            return '24h';
        case '24h':
        case 'today':
        case 'yesterday':
        case 'custom':
            return '7d';
        default:
            return undefined;
    }
};

/** True when an instant falls inside the window, bounds included. */
export const inWindow = (ms: number | undefined, period: Pick<ResolvedPeriod, 'fromMs' | 'toMs'>): boolean =>
    ms !== undefined && ms >= period.fromMs && ms <= period.toMs;
