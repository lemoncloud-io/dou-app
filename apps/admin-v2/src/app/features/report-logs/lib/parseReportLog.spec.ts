/**
 * `lib/report-logs/parseReportLog.spec.ts`
 * - Covers the plausible storage shapes of a stored report (unverified backend
 *   mapping), ensuring the parser degrades gracefully and never throws.
 */
import { describe, expect, it } from 'vitest';

import { parseReportLog } from './parseReportLog';

const errorPayload = {
    message: 'Boom failed\nsecond line',
    stack: 'Error: Boom\n at x',
    app: 'web',
    env: 'prod',
    url: 'https://app/x',
    user: { uid: '1000891', name: 'Raine' },
    http: { status: 500 },
    network: { online: true },
};

const issuePayload = {
    title: 'Cannot send message',
    message: 'it just spins',
    app: 'mobile',
    env: 'dev',
    logs: [{ level: 'info', message: 'a' }],
    version: { appVersion: '1.2.3' },
};

describe('parseReportLog', () => {
    it('unwraps a SlackReportBody stored as a meta object (message = JSON string)', () => {
        const row = parseReportLog({
            id: 'm1',
            createdAt: 100,
            meta: { title: '[web] error', message: JSON.stringify(errorPayload), save: true },
        });
        expect(row.type).toBe('error');
        expect(row.app).toBe('web');
        expect(row.env).toBe('prod');
        // Error has no human title → summary is the first line of the message.
        expect(row.title).toBe('Boom failed');
        expect(row.payload?.stack).toContain('Error: Boom');
        expect(row.message).toBe('Boom failed\nsecond line');
        expect(row.userName).toBe('Raine');
        expect(row.userId).toBe('1000891');
        expect(row.parseError).toBe(false);
    });

    it('unwraps a SlackReportBody stored as a meta JSON string', () => {
        const row = parseReportLog({
            id: 'm2',
            meta: JSON.stringify({
                title: '[mobile] issue: Cannot send message',
                message: JSON.stringify(issuePayload),
            }),
        });
        expect(row.type).toBe('issue');
        expect(row.app).toBe('mobile');
        expect(row.title).toBe('Cannot send message');
        expect(row.payload?.logs).toHaveLength(1);
    });

    it('treats a bare payload object in meta as the payload and infers type', () => {
        const row = parseReportLog({ id: 'm3', meta: errorPayload });
        expect(row.type).toBe('error'); // inferred from stack/http/network
        expect(row.app).toBe('web');
        expect(row.title).toBe('Boom failed');
    });

    it('infers issue type from payload when no title prefix is present', () => {
        const row = parseReportLog({ id: 'm4', meta: issuePayload });
        expect(row.type).toBe('issue'); // inferred from logs/version
        expect(row.title).toBe('Cannot send message'); // payload.title
    });

    it('uses the record name as the title source when meta lacks a title', () => {
        const row = parseReportLog({ id: 'm5', name: '[web] issue: From name', meta: { foo: 1 } });
        expect(row.type).toBe('issue');
        expect(row.app).toBe('web');
        expect(row.title).toBe('From name');
    });

    it('flags parseError and preserves raw for an unparseable meta string', () => {
        const row = parseReportLog({ id: 'm6', meta: 'not-json-at-all' });
        expect(row.parseError).toBe(true);
        expect(row.type).toBe('unknown');
        expect(row.payload).toBeNull();
        expect(row.raw).toBe('not-json-at-all');
    });

    it('handles a record with no meta at all', () => {
        const row = parseReportLog({ id: 'm7' });
        expect(row.parseError).toBe(false);
        expect(row.type).toBe('unknown');
        expect(row.title).toBe('(untitled)');
        expect(row.payload).toBeNull();
    });

    it('parses category from the new `[app] <category>` title format (ADR-0029)', () => {
        const row = parseReportLog({
            id: 'm8',
            meta: {
                title: '[mobile] script-error',
                message: JSON.stringify({ ...errorPayload, category: 'script-error', app: 'mobile' }),
            },
        });
        expect(row.type).toBe('error');
        expect(row.app).toBe('mobile');
        expect(row.category).toBe('script-error');
    });

    it('keeps legacy `[app] error` titles working with no category', () => {
        const row = parseReportLog({
            id: 'm9',
            meta: { title: '[mobile] error', message: JSON.stringify(errorPayload) },
        });
        expect(row.type).toBe('error');
        expect(row.category).toBeUndefined();
    });

    it('falls back to the payload `category` field when the title has none', () => {
        const row = parseReportLog({ id: 'm10', meta: { ...errorPayload, category: 'network' } });
        expect(row.type).toBe('error');
        expect(row.category).toBe('network');
    });
});

// The client sends screenshots as `SlackReportBody.meta.images`, kept out of the
// Slack-bound `message`. Where the backend puts that meta on the stored record is
// unverified, so the parser probes several shapes — cover each.
describe('parseReportLog — attached images', () => {
    const IMAGE = 'data:image/jpeg;base64,AAAA';
    const issuePayload = { title: '느려요', message: '본문', app: 'web', logs: [] };

    it('reads images from the SlackReportBody wrapper meta', () => {
        const row = parseReportLog({
            id: 'i1',
            meta: {
                title: '[web] issue: 느려요',
                message: JSON.stringify(issuePayload),
                meta: { images: [IMAGE] },
            },
        });
        expect(row.images).toEqual([IMAGE]);
        expect(row.type).toBe('issue');
    });

    it('reads images when the record meta IS the meta object', () => {
        const row = parseReportLog({ id: 'i2', meta: { images: [IMAGE] } });
        expect(row.images).toEqual([IMAGE]);
    });

    it('reads images that ended up inside the payload', () => {
        const row = parseReportLog({
            id: 'i3',
            meta: { title: '[web] issue: 느려요', message: JSON.stringify({ ...issuePayload, images: [IMAGE] }) },
        });
        expect(row.images).toEqual([IMAGE]);
    });

    it('is undefined when the report carried no attachment', () => {
        const row = parseReportLog({
            id: 'i4',
            meta: { title: '[web] issue: 느려요', message: JSON.stringify(issuePayload) },
        });
        expect(row.images).toBeUndefined();
    });

    it('drops entries that are not renderable image sources', () => {
        const row = parseReportLog({
            id: 'i5',
            meta: { images: [IMAGE, 'javascript:alert(1)', 'not-a-url', 42, null] },
        });
        expect(row.images).toEqual([IMAGE]);
    });

    it('accepts hosted URLs too, for when uploads replace inline base64', () => {
        const row = parseReportLog({ id: 'i6', meta: { images: ['https://cdn.test/a.png'] } });
        expect(row.images).toEqual(['https://cdn.test/a.png']);
    });
});

// Shape taken from a real dev record (2026-08-11): the backend keeps the SlackReportBody
// under the record's `meta` and adds `id`.
//
// NOTE: that nested `meta` came back `{}` even though the client DID send images in it —
// the backend discards a client-supplied `meta`. These cases therefore pin the parser's
// handling of the envelope, not a working transport; the empty-meta case is what production
// actually looks like today. See ADR-0049.
describe('parseReportLog — real stored envelope', () => {
    const IMAGE = 'data:image/jpeg;base64,AAAA';

    const storedRecord = (meta: Record<string, unknown>) => ({
        id: '1009178',
        meta: {
            title: '[web] issue: 레인',
            message: JSON.stringify({
                title: '레인',
                message: '1',
                app: 'web',
                env: 'dev',
                url: 'https://dou-dev.chatic.io/mypage/feedback',
                user: { uid: '1001525', role: 'guest', isAuthenticated: true },
                logs: [],
                path: '/mypage/feedback',
                routeTrail: ['/mypage', '/mypage/feedback'],
            }),
            meta,
            silent: false,
            save: true,
            id: '1009178',
        },
    });

    it('parses the envelope and finds no attachment when meta is the empty default', () => {
        const row = parseReportLog(storedRecord({}));

        expect(row.type).toBe('issue');
        expect(row.title).toBe('레인');
        expect(row.payload?.routeTrail).toEqual(['/mypage', '/mypage/feedback']);
        expect(row.images).toBeUndefined();
    });

    it('finds attachments once the client fills that same meta', () => {
        const row = parseReportLog(storedRecord({ images: [IMAGE, IMAGE] }));

        expect(row.images).toEqual([IMAGE, IMAGE]);
        // The rest of the report still parses exactly as before.
        expect(row.type).toBe('issue');
        expect(row.title).toBe('레인');
    });
});

// Batch-uploaded structured logs (chatic-backend-api log-batch-ingest) share the same
// `stereo='log'` bucket as the Slack error reports above (SPEC.md D6). They're detected
// structurally — `level`+`tag` together is never set by a Slack report — and skip the
// title/payload unwrap entirely.
describe('parseReportLog — batch LogEntry', () => {
    it('parses a debug-level entry (e.g. WEB_VITALS) as log-entry, not unknown', () => {
        const row = parseReportLog({
            id: '1013322',
            createdAt: 1787211544197,
            meta: {
                level: 'debug',
                tag: 'WEB_VITALS',
                message: 'INP',
                data: JSON.stringify({ value: '64.00', rating: 'good' }),
                timestamp: 1787211544197,
                source: 'web',
                id: '1013322',
            },
        });

        expect(row.type).toBe('log-entry');
        expect(row.level).toBe('debug');
        expect(row.tag).toBe('WEB_VITALS');
        expect(row.title).toBe('WEB_VITALS');
        expect(row.message).toBe('INP');
        expect(row.source).toBe('web');
        expect(row.logData).toEqual({ value: '64.00', rating: 'good' });
        expect(row.parseError).toBe(false);
    });

    it('parses an info-level entry with no `data` and no `source` (e.g. IAP)', () => {
        const row = parseReportLog({
            id: '1013397',
            createdAt: 1787214102551,
            meta: {
                level: 'info',
                tag: 'IAP',
                message: 'Fetching available purchases for restore...',
                timestamp: 1787214102551,
                id: '1013397',
            },
        });

        expect(row.type).toBe('log-entry');
        expect(row.level).toBe('info');
        expect(row.tag).toBe('IAP');
        expect(row.source).toBeUndefined();
        expect(row.logData).toBeUndefined();
        expect(row.logDataRaw).toBeUndefined();
    });

    it('prefers uid/runId hoisted onto the record when meta omits them', () => {
        const row = parseReportLog({
            id: 'l1',
            uid: '1000891',
            runId: 'run-abc',
            meta: { level: 'error', tag: 'NET', message: 'timeout' },
        });

        expect(row.userId).toBe('1000891');
        expect(row.runId).toBe('run-abc');
    });

    it('still routes a Slack error report through the report parser, not the log-entry one', () => {
        const row = parseReportLog({
            id: 'm-not-log',
            meta: { title: '[web] error', message: JSON.stringify(errorPayload) },
        });

        expect(row.type).toBe('error');
        expect(row.level).toBeUndefined();
    });
});
