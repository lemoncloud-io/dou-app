import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildReportLogListParams, reportLogBaseFor, requireReportLogBase, STEREO_BY_KIND } from './reportLogApi';

describe('reportLogApi', () => {
    describe('reportLogBaseFor', () => {
        afterEach(() => vi.unstubAllEnvs());

        it("reads each stage's archive from its own key, hosts and all", () => {
            vi.stubEnv('VITE_D1_ARCHIVE_ENDPOINT', 'https://dev.example.com/arc-d1/');
            vi.stubEnv('VITE_V1_ARCHIVE_ENDPOINT', 'https://prod.example.com/arc-v1');

            expect(reportLogBaseFor('d1')).toBe('https://dev.example.com/arc-d1');
            expect(reportLogBaseFor('v1')).toBe('https://prod.example.com/arc-v1');
        });

        it('does not derive one stage from the other', () => {
            vi.stubEnv('VITE_D1_ARCHIVE_ENDPOINT', 'https://dev.example.com/arc-d1');
            vi.stubEnv('VITE_V1_ARCHIVE_ENDPOINT', '');

            expect(reportLogBaseFor('v1')).toBe('');
        });
    });

    describe('requireReportLogBase', () => {
        afterEach(() => vi.unstubAllEnvs());

        it('returns the base when the key is set', () => {
            vi.stubEnv('VITE_V1_ARCHIVE_ENDPOINT', 'https://prod.example.com/arc-v1');
            expect(requireReportLogBase('v1')).toBe('https://prod.example.com/arc-v1');
        });

        it('names the missing key instead of calling a same-origin path', () => {
            vi.stubEnv('VITE_D1_ARCHIVE_ENDPOINT', '');
            expect(() => requireReportLogBase('d1')).toThrow(/VITE_D1_ARCHIVE_ENDPOINT is not set/);
        });
    });

    describe('STEREO_BY_KIND', () => {
        it('should map the error kind to the log stereo', () => {
            expect(STEREO_BY_KIND.error).toBe('log');
        });

        it('should map the issue kind to the issue stereo', () => {
            expect(STEREO_BY_KIND.issue).toBe('issue');
        });

        it('should send no filter for all', () => {
            expect(STEREO_BY_KIND.all).toBeUndefined();
            expect(buildReportLogListParams({ type: STEREO_BY_KIND.all })).toEqual({ page: 0, limit: 100 });
        });

        it('should map the log-entry kind to the same log stereo as error', () => {
            expect(STEREO_BY_KIND['log-entry']).toBe('log');
        });
    });

    describe('buildReportLogListParams', () => {
        it('should default to first page with limit 100 and no filters', () => {
            expect(buildReportLogListParams()).toEqual({ page: 0, limit: 100 });
        });

        it('should pass type/from/to through when set', () => {
            expect(
                buildReportLogListParams({ page: 2, limit: 50, type: 'log', from: '2026-08-01', to: '2026-08-04' })
            ).toEqual({ page: 2, limit: 50, type: 'log', from: '2026-08-01', to: '2026-08-04' });
        });

        it('should omit empty-string filters (absent key = no server filter)', () => {
            expect(buildReportLogListParams({ type: '', from: '', to: '' })).toEqual({ page: 0, limit: 100 });
        });

        it('should allow a one-sided date range', () => {
            expect(buildReportLogListParams({ from: '2026-08-01' })).toEqual({
                page: 0,
                limit: 100,
                from: '2026-08-01',
            });
            expect(buildReportLogListParams({ to: '2026-08-04' })).toEqual({ page: 0, limit: 100, to: '2026-08-04' });
        });

        it('should pass level/runId through when set', () => {
            expect(buildReportLogListParams({ level: 'error', runId: 'run-abc' })).toEqual({
                page: 0,
                limit: 100,
                level: 'error',
                runId: 'run-abc',
            });
        });

        it('should omit an empty-string level/runId', () => {
            expect(buildReportLogListParams({ level: '', runId: '' })).toEqual({ page: 0, limit: 100 });
        });

        it('carries the round-2 axes when set', () => {
            expect(
                buildReportLogListParams({
                    tag: 'UPLOAD',
                    appVersion: '1.4.0',
                    webVersion: '0.62.0',
                    route: '/chat',
                    os: 'iOS',
                    osVersion: '18.0',
                    model: 'iPhone16',
                })
            ).toEqual({
                page: 0,
                limit: 100,
                tag: 'UPLOAD',
                appVersion: '1.4.0',
                webVersion: '0.62.0',
                route: '/chat',
                os: 'iOS',
                osVersion: '18.0',
                model: 'iPhone16',
            });
        });

        it('omits a round-2 axis that is empty or undefined', () => {
            expect(buildReportLogListParams({ tag: '', appVersion: undefined, model: '' })).toEqual({
                page: 0,
                limit: 100,
            });
        });

        it('should pass uid/cid through when set', () => {
            expect(buildReportLogListParams({ uid: 'u1', cid: 'c1' })).toEqual({
                page: 0,
                limit: 100,
                uid: 'u1',
                cid: 'c1',
            });
        });

        it('should omit an empty-string uid/cid', () => {
            expect(buildReportLogListParams({ uid: '', cid: '' })).toEqual({ page: 0, limit: 100 });
        });

        it('should carry every axis at once', () => {
            expect(
                buildReportLogListParams({
                    page: 3,
                    limit: 100,
                    type: 'log',
                    from: '2026-09-01',
                    to: '2026-09-02',
                    level: 'error',
                    runId: 'run-a',
                    uid: 'u1',
                    cid: 'c1',
                })
            ).toEqual({
                page: 3,
                limit: 100,
                type: 'log',
                from: '2026-09-01',
                to: '2026-09-02',
                level: 'error',
                runId: 'run-a',
                uid: 'u1',
                cid: 'c1',
            });
        });

        it('should never send a sort param', () => {
            expect(buildReportLogListParams({ page: 1 })).not.toHaveProperty('sort');
        });
    });

    describe('aggregation parameters', () => {
        it('sends them only when asked for, so a plain list call is unchanged', () => {
            expect(buildReportLogListParams({ groupBy: [], interval: undefined, users: false })).toEqual({
                page: 0,
                limit: 100,
            });
        });

        it('joins the group fields and sends users as a flag', () => {
            expect(
                buildReportLogListParams({ groupBy: ['tag', 'level'], aggrSize: 50, interval: 'hour', users: true })
            ).toEqual({ page: 0, limit: 100, groupBy: 'tag,level', aggrSize: 50, interval: 'hour', users: 1 });
        });

        it('drops a bucket size that has no field to apply to', () => {
            expect(buildReportLogListParams({ aggrSize: 50 })).toEqual({ page: 0, limit: 100 });
        });
    });
});
