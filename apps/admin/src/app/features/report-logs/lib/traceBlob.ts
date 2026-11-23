import type { ReportPayload, ReportLogRow } from './parseReportLog';

export const composeStackText = (payload: ReportPayload | null): string => {
    if (!payload) return '';

    const blocks = [payload.stack?.trim()].filter(Boolean) as string[];

    for (const cause of payload.causes ?? []) {
        blocks.push([`Caused by: ${cause.message}`, cause.stack?.trim()].filter(Boolean).join('\n'));
    }

    return blocks.join('\n\n');
};

const reportedAt = (row: ReportLogRow): string | undefined => {
    const stamps = [row.payload?.timestamp, row.createdAt];

    for (const stamp of stamps) {
        if (stamp === undefined || stamp === null || stamp === '') continue;
        const parsed = new Date(stamp).getTime();
        if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    }

    return undefined;
};

export const buildTraceBlob = (row: ReportLogRow, stack: string): string => {
    const fields: [string, unknown][] = [
        ['id', row.id],
        ['app', row.app],
        ['webVersion', row.payload?.webVersion],
        ['at', reportedAt(row)],
    ];

    const header = fields
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, '_')}`)
        .join(' ');

    return `# chatic-report ${header}\n${stack.trim()}\n`;
};
