import { useMemo } from 'react';

import type { ReportStage } from '../api/reportLogApi';
import { eventAt } from '../lib/eventTime';
import type { ReportLogRow } from '../lib/parseReportLog';
import { inWindow, type ResolvedPeriod } from '../lib/period';
import { recordKindOf } from '../lib/recordKinds';
import { useLogCorpus, type LogCorpus } from './use-log-corpus';

export interface StatRows {
    rows: ReportLogRow[];
    corpus: LogCorpus;
    loading: boolean;
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
