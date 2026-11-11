/**
 * `hooks/report-logs/use-stat-rows.ts`
 * - One statistic's records for the period: fetched narrowed to its tag on the server, then cut to
 *   the exact window by occurrence time.
 *
 * The statistics views read one statistic at a time, and an unfiltered page is mostly logs, so
 * each view asks for its tag. The fetch is the shared one-page corpus: `partial` says when the
 * period held more than one page, so a view can say its numbers are from the newest part.
 */
import { useMemo } from 'react';

import type { ReportStage } from '../api/reportLogApi';
import { eventAt } from '../lib/eventTime';
import type { ReportLogRow } from '../lib/parseReportLog';
import { inWindow, type ResolvedPeriod } from '../lib/period';
import { recordKindOf } from '../lib/recordKinds';
import { useLogCorpus, type LogCorpus } from './use-log-corpus';

export interface StatRows {
    /** The statistic's records inside the window (logs that happen to share the tag left out). */
    rows: ReportLogRow[];
    corpus: LogCorpus;
    loading: boolean;
    /** The period held more records than one fetch returns. */
    partial: boolean;
}

export const useStatRows = (
    stage: ReportStage,
    period: ResolvedPeriod,
    tag: string,
    options?: { enabled?: boolean }
): StatRows => {
    const corpus = useLogCorpus({ stage, from: period.fromDate, to: period.toDate, tag }, options);
    const rows = useMemo(
        () => corpus.rows.filter(row => recordKindOf(row) !== 'log' && inWindow(eventAt(row), period)),
        [corpus.rows, period]
    );
    return {
        rows,
        corpus,
        loading: corpus.phase === 'collecting' && corpus.loaded === 0,
        partial: corpus.isTruncated,
    };
};
