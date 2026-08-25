/**
 * `api/reportLogApi.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import { buildReportLogListParams, STEREO_BY_KIND } from './reportLogApi';

describe('reportLogApi', () => {
    describe('STEREO_BY_KIND', () => {
        // The names deliberately differ: an error report is stored with stereo `log`.
        // Passing the UI value straight through would query a stereo nothing uses.
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

        // Batch LogEntry saves share the `log` stereo with error reports (not split
        // server-side yet — log-batch-ingest SPEC.md D6); parseReportLog splits them client-side.
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
    });
});
