export const PERIOD_PRESETS = ['1h', '24h', 'today', 'yesterday', '7d', 'custom'] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number] | 'around';

export interface PeriodInput {
    preset: PeriodPreset;
    from?: string;
    to?: string;
    at?: number;
}

export interface ResolvedPeriod {
    preset: PeriodPreset;
    fromMs: number;
    toMs: number;
    fromDate: string;
    toDate: string;
    exact: boolean;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const AROUND_HALF_MS = 30 * 60 * 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const kstDate = (ms: number): string => new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);

export const kstDayStart = (date: string): number => Date.parse(`${date}T00:00:00.000+09:00`);

export const kstDayEnd = (date: string): number => kstDayStart(date) + DAY_MS - 1;

export const isKstDate = (value?: string): value is string => {
    if (!value || !DATE_RE.test(value)) return false;
    const start = kstDayStart(value);
    return !Number.isNaN(start) && kstDate(start) === value;
};

const isDate = isKstDate;

const spanOf = (preset: PeriodPreset, fromMs: number, toMs: number, exact: boolean): ResolvedPeriod => ({
    preset,
    fromMs,
    toMs,
    fromDate: kstDate(fromMs),
    toDate: kstDate(toMs),
    exact,
});

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

export const inWindow = (ms: number | undefined, period: Pick<ResolvedPeriod, 'fromMs' | 'toMs'>): boolean =>
    ms !== undefined && ms >= period.fromMs && ms <= period.toMs;
