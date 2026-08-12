/**
 * `lib/report-logs/traceBlob.ts`
 * - Packs a report's stack with the few facts `yarn trace` needs to locate the
 *   build's source map, so the IDE side of the handoff takes no arguments.
 *
 * Resolving a stack needs two things the trace itself does not carry: which CI
 * project built the bundle (from `app` — mobile is a WebView over the web
 * build) and when the error happened (the map cannot come from a deploy that
 * postdates it). Both are here so the operator copies once and pastes once.
 *
 * The header is one comment line of `key=value` pairs: `scripts/trace-report.js`
 * splits it on whitespace, and anyone reading the blob still sees a plain stack
 * underneath. See libs/web-core/docs/error-reporting.md.
 */
import type { ReportPayload, ReportLogRow } from './parseReportLog';

/**
 * The stack plus its `cause` chain as one block, in the `Caused by:` shape a
 * JVM trace uses. Composed rather than rendered separately because everything
 * downstream — symbolication, the clipboard, `yarn trace` — wants one text with
 * frames in it: resolving the composed block resolves the cause stacks for
 * free, and those are usually the frames worth reading (the outer stack points
 * at whoever re-threw).
 */
export const composeStackText = (payload: ReportPayload | null): string => {
    if (!payload) return '';

    const blocks = [payload.stack?.trim()].filter(Boolean) as string[];

    for (const cause of payload.causes ?? []) {
        blocks.push([`Caused by: ${cause.message}`, cause.stack?.trim()].filter(Boolean).join('\n'));
    }

    return blocks.join('\n\n');
};

/** ISO form of whichever timestamp the report actually carries, if either does. */
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
        // Pairs are split on whitespace, so a value holding one would be read as
        // the start of the next field.
        .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, '_')}`)
        .join(' ');

    return `# chatic-report ${header}\n${stack.trim()}\n`;
};
