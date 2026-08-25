/**
 * `lib/report-logs/reportLogFormat.ts`
 * - Presentation helpers: relative time and CSV export for report rows.
 */
import type { ReportLogRow } from './parseReportLog';

/** Compact relative time like "5분 전" / "2시간 전"; falls back to "-" for missing ts. */
export const formatRelative = (ms?: number, now: number = Date.now()): string => {
    if (!ms) return '-';
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

const CSV_COLUMNS: Array<[header: string, get: (r: ReportLogRow) => string]> = [
    ['id', r => r.id],
    ['type', r => r.type],
    ['level', r => r.level ?? ''],
    ['tag', r => r.tag ?? ''],
    ['source', r => r.source ?? ''],
    ['runId', r => r.runId ?? ''],
    ['app', r => r.app ?? ''],
    ['env', r => r.env ?? ''],
    ['title', r => r.title],
    ['message', r => r.message ?? ''],
    ['userName', r => r.userName ?? ''],
    ['userId', r => r.userId ?? ''],
    ['createdAt', r => (r.createdAt ? new Date(r.createdAt).toISOString() : '')],
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
