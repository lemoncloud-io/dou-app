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
import { recordKindOf, type RecordKind } from '../lib/recordKinds';

interface RunTimelineProps {
    rows: ReportLogRow[];
    onSelect: (row: ReportLogRow) => void;
    selectedId?: string;
    /** The pinned run, for the header. Absent when the view is open without a pin. */
    runId?: string;
    /** Which record kinds are shown. Every kind of the run sits on one line, in occurrence order. */
    kinds?: RecordKind[];
    onToggleKind?: (kind: RecordKind) => void;
}

const KIND_LABELS: Record<RecordKind, string> = { log: 'Logs', trace: 'Traces', sample: 'Samples', event: 'Events' };

const ALL_KINDS: RecordKind[] = ['log', 'trace', 'sample', 'event'];

/**
 * A trace drawn as a bar against the run's longest one, so slow spans stand out while scrolling.
 * A trace's `timestamp` is when it ended; the bar is its length, not its position.
 */
const TraceBar = ({ durationMs, longest }: { durationMs: number; longest: number }) => (
    <span className="flex w-40 shrink-0 items-center gap-1.5">
        <span className="h-1.5 flex-1 rounded bg-muted">
            <span
                className="block h-1.5 rounded bg-primary"
                style={{ width: `${Math.max(2, Math.round((durationMs / Math.max(1, longest)) * 100))}%` }}
            />
        </span>
        <span className="w-14 text-right font-mono text-[11px] text-muted-foreground">{durationMs}ms</span>
    </span>
);

/** A statistic's dimensions and numbers on one line, for scanning. */
const statSummary = (row: ReportLogRow): string =>
    [
        ...Object.entries(row.attrs ?? {}).map(([k, v]) => `${k}=${v}`),
        ...Object.entries(row.metrics ?? {}).map(([k, v]) => `${k}=${v}`),
    ].join(' · ');

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

export const RunTimeline = ({
    rows,
    onSelect,
    selectedId,
    runId,
    kinds = ALL_KINDS,
    onToggleKind,
}: RunTimelineProps) => {
    const ordered = useMemo(
        () => rows.filter(row => kinds.includes(recordKindOf(row))).sort(byEventAtAsc),
        [rows, kinds]
    );
    const longest = useMemo(() => Math.max(0, ...ordered.map(row => row.durationMs ?? 0)), [ordered]);
    const present = useMemo(() => new Set(rows.map(recordKindOf)), [rows]);

    // Offered once the run holds a statistic — a run of logs alone needs no toggles — and whenever
    // a kind the run holds is hidden: the choice outlives a re-pin, and without the toggle a run of
    // only that kind would show nothing with no way back.
    const toggles =
        onToggleKind &&
        ([...present].some(kind => kind !== 'log') || [...present].some(kind => !kinds.includes(kind))) ? (
            <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-1.5">
                {ALL_KINDS.filter(kind => present.has(kind)).map(kind => (
                    <button
                        key={kind}
                        type="button"
                        aria-pressed={kinds.includes(kind)}
                        onClick={() => onToggleKind(kind)}
                        className={`rounded border px-2 py-0.5 text-[11px] ${
                            kinds.includes(kind)
                                ? 'border-primary bg-primary/10 text-foreground'
                                : 'border-border text-muted-foreground'
                        }`}
                    >
                        {KIND_LABELS[kind]}
                    </button>
                ))}
            </div>
        ) : null;

    if (!runId) {
        return (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                Pin a run (runId) from a row to see that run's timeline here.
            </p>
        );
    }

    if (ordered.length === 0) {
        return (
            <>
                {toggles}
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">No records for this run.</p>
            </>
        );
    }

    const span = (eventAt(ordered[ordered.length - 1]) ?? 0) - (eventAt(ordered[0]) ?? 0);

    return (
        <div className="flex flex-col">
            <div className="flex flex-wrap items-baseline gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
                <span className="font-mono text-foreground">{runId}</span>
                <span>· {ordered.length.toLocaleString()} rows</span>
                {span > 0 && <span>· span {formatGap(span).replace('+', '')}</span>}
                <span>· sorted by occurrence time, ascending</span>
            </div>
            {toggles}
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
                                {recordKindOf(row) === 'log' ? (
                                    <span
                                        className={`w-12 shrink-0 rounded px-1 text-center text-[10px] font-semibold uppercase ${levelBadgeClass(row.level)}`}
                                    >
                                        {row.level ?? row.type}
                                    </span>
                                ) : (
                                    <span className="w-12 shrink-0 rounded border border-primary/40 px-1 text-center text-[10px] font-semibold uppercase text-primary">
                                        {recordKindOf(row)}
                                    </span>
                                )}
                                {row.tag && (
                                    <span className="w-24 shrink-0 truncate font-mono text-[11px] text-muted-foreground">
                                        {row.tag}
                                    </span>
                                )}
                                {row.recordKind === 'trace' && row.durationMs !== undefined && (
                                    <TraceBar durationMs={row.durationMs} longest={longest} />
                                )}
                                <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={row.message}>
                                    {recordKindOf(row) === 'log' ? (row.message ?? row.title) : statSummary(row)}
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
