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
});
