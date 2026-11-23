import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchReportLogs } from '../api/reportLogApi';
import { parseReportLog, type ReportLogRow } from '../lib/parseReportLog';
import { corpusKey, type CorpusParams } from './use-log-corpus';

export const PROBE_INTERVAL_MS = 15_000;
export const PROBE_LIMIT = 50;

export interface NewLogProbe {
    rows: ReportLogRow[];
    count: number;
    overflowed: boolean;
    take: () => ReportLogRow[];
    reset: () => void;
}

export const useNewLogProbe = (
    params: CorpusParams,
    headCreatedAt: number | undefined,
    options?: { enabled?: boolean; intervalMs?: number }
): NewLogProbe => {
    const enabled = options?.enabled ?? true;
    const intervalMs = options?.intervalMs ?? PROBE_INTERVAL_MS;

    const [rows, setRows] = useState<ReportLogRow[]>([]);
    const [overflowed, setOverflowed] = useState(false);

    const headRef = useRef(headCreatedAt);
    const paramsRef = useRef(params);
    useEffect(() => {
        headRef.current = headCreatedAt;
        paramsRef.current = params;
    });

    const paramsKey = corpusKey(params);

    useEffect(() => {
        setRows([]);
        setOverflowed(false);
    }, [paramsKey]);

    const enabledRef = useRef(enabled);
    useEffect(() => {
        enabledRef.current = enabled;
    });

    useEffect(() => {
        let cancelled = false;

        const probe = async () => {
            if (!enabledRef.current) return;
            if (typeof document !== 'undefined' && document.hidden) return;
            const head = headRef.current;
            try {
                const data = await fetchReportLogs({ ...paramsRef.current, page: 0, limit: PROBE_LIMIT });
                if (cancelled) return;
                const returned = (data.list ?? []).map(parseReportLog);
                const fresh = head === undefined ? returned : returned.filter(row => (row.createdAt ?? 0) > head);
                setRows(fresh);
                setOverflowed(fresh.length >= PROBE_LIMIT && returned.length >= PROBE_LIMIT);
            } catch {
                // A failed probe is not worth surfacing — the corpus is unaffected and the
                // next tick retries. Reporting it would put an error on a working screen.
                // Note the watermark does not move on failure, so a run of failures widens
                // the window rather than losing it; overflow then reports the truth.
            }
        };

        const timer = setInterval(() => void probe(), intervalMs);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [paramsKey, intervalMs]);

    const take = useCallback(() => {
        const taken = rows;
        setRows([]);
        setOverflowed(false);
        return taken;
    }, [rows]);

    const reset = useCallback(() => {
        setRows([]);
        setOverflowed(false);
    }, []);

    return { rows, count: rows.length, overflowed, take, reset };
};
