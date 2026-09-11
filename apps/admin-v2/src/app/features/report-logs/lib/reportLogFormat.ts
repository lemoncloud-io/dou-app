/**
 * `lib/report-logs/reportLogFormat.ts`
 * - Presentation helpers: relative time and CSV export for report rows.
 */
import { eventAt, ingestLagMs } from './eventTime';
import type { ReportLogRow } from './parseReportLog';

/**
 * Absolute time for a tooltip or a detail line. `-` only when there is no instant at all —
 * `0` is epoch, which `eventAt` deliberately preserves as a real value rather than hiding
 * a bad device clock, so it must not read as "missing" here either.
 */
export const formatAbsolute = (ms?: number): string => (ms === undefined ? '-' : new Date(ms).toLocaleString());

/** Compact relative time like "5분 전" / "2시간 전"; falls back to "-" for a missing instant. */
export const formatRelative = (ms?: number, now: number = Date.now()): string => {
    if (ms === undefined) return '-';
    const diff = Math.max(0, now - ms);
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return '방금';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}분 전`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}시간 전`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day}일 전`;
    const mon = Math.floor(day / 30);
    if (mon < 12) return `${mon}개월 전`;
    return `${Math.floor(mon / 12)}년 전`;
};

/**
 * ISO 8601, or blank. `eventAt` already rejects an implausible clock, but `createdAt` is
 * exported raw — and `toISOString` throws `RangeError` past 8.64e15, which would take the
 * whole export down from inside a click handler. One bad row must not cost the CSV.
 */
const iso = (ms?: number): string => {
    if (ms === undefined) return '';
    try {
        return new Date(ms).toISOString();
    } catch {
        return '';
    }
};

/**
 * Both clocks are exported, plus the gap between them. A spreadsheet is where someone
 * re-sorts this data, and sorting by the wrong clock is exactly the mistake the screen
 * exists to prevent — so `eventAt` leads and `createdAt` is kept alongside it rather than
 * replaced.
 */
const CSV_COLUMNS: Array<[header: string, get: (r: ReportLogRow) => string]> = [
    ['id', r => r.id],
    ['type', r => r.type],
    ['level', r => r.level ?? ''],
    ['tag', r => r.tag ?? ''],
    ['source', r => r.source ?? ''],
    ['runId', r => r.runId ?? ''],
    ['app', r => r.app ?? ''],
    ['env', r => r.env ?? ''],
    ['appVersion', r => r.appVersion ?? ''],
    ['webVersion', r => r.webVersion ?? ''],
    ['route', r => r.route ?? ''],
    ['os', r => r.os ?? ''],
    ['title', r => r.title],
    ['message', r => r.message ?? ''],
    ['userName', r => r.userName ?? ''],
    ['userId', r => r.userId ?? ''],
    ['cid', r => r.cid ?? ''],
    ['sid', r => r.sid ?? ''],
    ['eventAt', r => iso(eventAt(r))],
    ['createdAt', r => iso(r.createdAt)],
    [
        'ingestLagMs',
        r => {
            const lag = ingestLagMs(r);
            return lag === undefined ? '' : String(lag);
        },
    ],
];

/** Escape a CSV cell (RFC 4180: wrap in quotes, double inner quotes). */
const csvCell = (value: string): string => `"${value.replace(/"/g, '""')}"`;

/** Serialize rows to a CSV string with a header line. */
export const rowsToCsv = (rows: ReportLogRow[]): string => {
    const header = CSV_COLUMNS.map(([h]) => csvCell(h)).join(',');
    const lines = rows.map(row => CSV_COLUMNS.map(([, get]) => csvCell(get(row))).join(','));
    return [header, ...lines].join('\n');
};

/** Trigger a client-side download of `content` as `filename`. */
export const downloadTextFile = (filename: string, content: string, mime = 'text/csv;charset=utf-8'): void => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Defer revoke so the browser has committed the download (revoking synchronously
    // after click() can cancel it in some browsers).
    setTimeout(() => URL.revokeObjectURL(url), 0);
};
