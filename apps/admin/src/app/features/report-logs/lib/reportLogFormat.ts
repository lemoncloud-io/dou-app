import { eventAt, ingestLagMs } from './eventTime';
import { formatOs } from './parseReportLog';
import type { ReportLogRow } from './parseReportLog';

const iso = (ms?: number): string => {
    if (ms === undefined) return '';
    try {
        return new Date(ms).toISOString();
    } catch {
        return '';
    }
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
    ['appVersion', r => r.appVersion ?? ''],
    ['webVersion', r => r.webVersion ?? ''],
    ['route', r => r.route ?? ''],
    ['os', r => formatOs(r.os, r.osVersion) ?? ''],
    ['model', r => r.model ?? ''],
    ['kind', r => r.recordKind ?? ''],
    ['durationMs', r => (r.durationMs === undefined ? '' : String(r.durationMs))],
    ['attrs', r => (r.attrs ? JSON.stringify(r.attrs) : '')],
    ['metrics', r => (r.metrics ? JSON.stringify(r.metrics) : '')],
    ['sr', r => (r.sr === undefined ? '' : String(r.sr))],
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

const csvCell = (value: string): string => `"${value.replace(/"/g, '""')}"`;

export const rowsToCsv = (rows: ReportLogRow[]): string => {
    const header = CSV_COLUMNS.map(([h]) => csvCell(h)).join(',');
    const lines = rows.map(row => CSV_COLUMNS.map(([, get]) => csvCell(get(row))).join(','));
    return [header, ...lines].join('\n');
};

export const downloadTextFile = (filename: string, content: string, mime = 'text/csv;charset=utf-8'): void => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
};
