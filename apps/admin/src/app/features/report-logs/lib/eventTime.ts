import type { ReportLogRow } from './parseReportLog';

const MAX_PLAUSIBLE_MS = 9_999_999_999_999;

const plausible = (ms?: number): number | undefined =>
    typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 && ms <= MAX_PLAUSIBLE_MS ? ms : undefined;

export const eventAt = (row: ReportLogRow): number | undefined => plausible(row.timestamp) ?? plausible(row.createdAt);

export const ingestLagMs = (row: ReportLogRow): number | undefined => {
    const occurred = plausible(row.timestamp);
    const arrived = plausible(row.createdAt);
    if (occurred === undefined || arrived === undefined) return undefined;
    return Math.max(0, arrived - occurred);
};

export const LAG_NOTICE_MS = 60_000;

export const hasNoticeableLag = (row: ReportLogRow, threshold = LAG_NOTICE_MS): boolean => {
    const lag = ingestLagMs(row);
    return lag !== undefined && lag >= threshold;
};

export const isOutsideRange = (row: ReportLogRow, fromMs?: number, toMs?: number): boolean => {
    const at = eventAt(row);
    if (at === undefined) return false;
    if (fromMs !== undefined && at < fromMs) return true;
    if (toMs !== undefined && at > toMs) return true;
    return false;
};

const compareEventAt = (a: ReportLogRow, b: ReportLogRow, newestFirst: boolean): number => {
    const left = eventAt(a);
    const right = eventAt(b);
    if (left === right) return 0;
    if (left === undefined) return 1;
    if (right === undefined) return -1;
    if (left === right) return 0;
    return newestFirst ? (right > left ? 1 : -1) : left > right ? 1 : -1;
};

export const byEventAtDesc = (a: ReportLogRow, b: ReportLogRow): number => compareEventAt(a, b, true);

export const byEventAtAsc = (a: ReportLogRow, b: ReportLogRow): number => compareEventAt(a, b, false);
