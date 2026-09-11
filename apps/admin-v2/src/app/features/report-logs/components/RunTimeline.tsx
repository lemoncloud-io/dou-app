/**
 * `components/report-logs/RunTimeline.tsx`
 * - One app run's logs in the order they happened, with the gaps between them.
 *
 * A `runId` identifies a single app session, and within one session the only question
 * worth asking is sequence: what preceded the failure. So this is the one view that sorts
 * ascending, and it sorts on `eventAt` — ordering a run by arrival time would scramble it,
 * since the whole run typically uploads in one or two batches.
 *
 * The gap between consecutive entries is rendered because it is often the finding: a
 * 30-second hole before an error says something a list of timestamps makes the reader
 * compute for themselves.
 */
import { useMemo } from 'react';

import { levelBadgeClass } from '../lib/badgeClass';
import { byEventAtAsc, eventAt } from '../lib/eventTime';
import type { ReportLogRow } from '../lib/parseReportLog';

interface RunTimelineProps {
    rows: ReportLogRow[];
    onSelect: (row: ReportLogRow) => void;
    selectedId?: string;
    /** The pinned run, for the header. Absent when the view is open without a pin. */
    runId?: string;
}

const clockTime = (ms?: number): string =>
    ms === undefined ? '--:--:--' : new Date(ms).toLocaleTimeString(undefined, { hour12: false });

/** Gaps below this are ordinary chatter and not worth drawing attention to. */
const GAP_NOTICE_MS = 1_000;

const formatGap = (ms: number): string => {
    if (ms < 1_000) return `+${ms}ms`;
    if (ms < 60_000) return `+${(ms / 1_000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60_000);
    return `+${minutes}m ${Math.round((ms % 60_000) / 1_000)}s`;
};

export const RunTimeline = ({ rows, onSelect, selectedId, runId }: RunTimelineProps) => {
    const ordered = useMemo(() => [...rows].sort(byEventAtAsc), [rows]);

    if (!runId) {
        return (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                행에서 실행(runId)을 추적하면 그 실행의 시간순 흐름이 여기에 나옵니다.
            </p>
        );
    }

    if (ordered.length === 0) {
        return (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">이 실행에 해당하는 로그가 없습니다.</p>
        );
    }

    const span = (eventAt(ordered[ordered.length - 1]) ?? 0) - (eventAt(ordered[0]) ?? 0);

    return (
        <div className="flex flex-col">
            <div className="flex flex-wrap items-baseline gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
                <span className="font-mono text-foreground">{runId}</span>
                <span>· {ordered.length.toLocaleString()}건</span>
                {span > 0 && <span>· 구간 {formatGap(span).replace('+', '')}</span>}
                <span>· 발생 시각 오름차순</span>
            </div>
            <ol className="flex flex-col">
                {ordered.map((row, index) => {
                    const at = eventAt(row);
                    const previous = index > 0 ? eventAt(ordered[index - 1]) : undefined;
                    const gap = at !== undefined && previous !== undefined ? at - previous : undefined;
                    return (
                        <li key={row.id || `${index}`}>
                            {gap !== undefined && gap >= GAP_NOTICE_MS && (
                                <div className="flex items-center gap-2 px-4 py-0.5 text-[11px] text-muted-foreground">
                                    <span className="ml-[4.5rem] h-3 w-px bg-border" aria-hidden />
                                    <span>{formatGap(gap)}</span>
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => onSelect(row)}
                                className={`flex w-full items-start gap-3 px-4 py-1.5 text-left hover:bg-muted/50 ${
                                    selectedId && selectedId === row.id ? 'bg-muted' : ''
                                }`}
                            >
                                <span className="w-16 shrink-0 font-mono text-[11px] text-muted-foreground">
                                    {clockTime(at)}
                                </span>
                                <span
                                    className={`w-12 shrink-0 rounded px-1 text-center text-[10px] font-semibold uppercase ${levelBadgeClass(row.level)}`}
                                >
                                    {row.level ?? row.type}
                                </span>
                                {row.tag && (
                                    <span className="w-24 shrink-0 truncate font-mono text-[11px] text-muted-foreground">
                                        {row.tag}
                                    </span>
                                )}
                                <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={row.message}>
                                    {row.message ?? row.title}
                                </span>
                                {row.route && (
                                    <span className="hidden w-32 shrink-0 truncate font-mono text-[11px] text-muted-foreground xl:block">
                                        {row.route}
                                    </span>
                                )}
                            </button>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
};
