import { useMemo } from 'react';

import { useT, type Language } from '../../../i18n';
import { levelBadgeClass } from '../lib/badgeClass';
import { byEventAtAsc, eventAt } from '../lib/eventTime';
import type { ReportLogRow } from '../lib/parseReportLog';
import { recordKindOf, type RecordKind } from '../lib/recordKinds';
import { formatClock, formatDuration, formatNumber } from '../lib/timeFormat';

interface RunTimelineProps {
    rows: ReportLogRow[];
    onSelect: (row: ReportLogRow) => void;
    selectedId?: string;
    runId?: string;
    kinds?: RecordKind[];
    onToggleKind?: (kind: RecordKind) => void;
}

const ALL_KINDS: RecordKind[] = ['log', 'trace', 'sample', 'event'];

const TraceBar = ({ durationMs, longest, lng }: { durationMs: number; longest: number; lng: Language }) => (
    <span className="flex w-40 shrink-0 items-center gap-1.5">
        <span className="h-1.5 flex-1 rounded bg-muted">
            <span
                className="block h-1.5 rounded bg-primary"
                style={{ width: `${Math.max(2, Math.round((durationMs / Math.max(1, longest)) * 100))}%` }}
            />
        </span>
        <span className="w-14 text-right font-mono text-[11px] text-muted-foreground">
            {formatDuration(durationMs, lng)}
        </span>
    </span>
);

const statSummary = (row: ReportLogRow): string =>
    [
        ...Object.entries(row.attrs ?? {}).map(([k, v]) => `${k}=${v}`),
        ...Object.entries(row.metrics ?? {}).map(([k, v]) => `${k}=${v}`),
    ].join(' · ');

const GAP_NOTICE_MS = 1_000;

export const RunTimeline = ({
    rows,
    onSelect,
    selectedId,
    runId,
    kinds = ALL_KINDS,
    onToggleKind,
}: RunTimelineProps) => {
    const { t, lng } = useT('allLogs');
    const ordered = useMemo(
        () => rows.filter(row => kinds.includes(recordKindOf(row))).sort(byEventAtAsc),
        [rows, kinds]
    );
    const longest = useMemo(() => Math.max(0, ...ordered.map(row => row.durationMs ?? 0)), [ordered]);
    const present = useMemo(() => new Set(rows.map(recordKindOf)), [rows]);

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
                        {t(`timeline.kinds.${kind}`)}
                    </button>
                ))}
            </div>
        ) : null;

    if (!runId) {
        return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t('timeline.noRun')}</p>;
    }

    if (ordered.length === 0) {
        return (
            <>
                {toggles}
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t('timeline.empty')}</p>
            </>
        );
    }

    const span = (eventAt(ordered[ordered.length - 1]) ?? 0) - (eventAt(ordered[0]) ?? 0);

    return (
        <div className="flex flex-col">
            <div className="flex flex-wrap items-baseline gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
                <span className="font-mono text-foreground">{runId}</span>
                <span>
                    · {t(ordered.length === 1 ? 'rowsOne' : 'rowsOther', { n: formatNumber(ordered.length, lng) })}
                </span>
                {span > 0 && <span>{t('timeline.span', { duration: formatDuration(span, lng) })}</span>}
                <span>{t('timeline.sorted')}</span>
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
                                    <span>+{formatDuration(gap, lng)}</span>
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
                                    {formatClock(at, lng)}
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
                                    <TraceBar durationMs={row.durationMs} longest={longest} lng={lng} />
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
