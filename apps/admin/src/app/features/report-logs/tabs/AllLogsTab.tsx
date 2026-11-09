/**
 * `tabs/AllLogsTab.tsx`
 * - The all-logs tab, the developer's view: assembles the corpus, the filters and the five views.
 *
 * The page header above every tab owns the title and the server switch, so this tab starts at
 * its own controls.
 *
 * The screen's shape follows one constraint: the backend can only filter on the axes it
 * copied to the top of the record — `uid`, `sid`, `cid`, `runId`, `level`, `stereo`, a
 * `createdAt` range, and (for newer records) tag, versions, route and device. Everything else
 * lives inside `meta`, so the facets, the groups and the statistics here are computed over the
 * rows this page pulled down. The other tabs ask the server to count; this one shows rows.
 *
 * Hence the split this file is mostly about:
 *
 * - `useLogConsoleState` keeps the server axes and the client axes apart, in the URL.
 * - `useLogCorpus` walks the server-narrowed range page by page — changing a server axis
 *   restarts it; changing a client axis must not.
 * - `logFacets` + the memo below narrow and count what was collected.
 *
 * Nothing here re-fetches on a keystroke, and nothing silently presents a corpus-scoped
 * count as a dataset-wide one.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useT } from '../../../i18n';

import { ROUND_2_AXES, STEREO_BY_KIND } from '../api/reportLogApi';
import { useLogConsoleState } from '../hooks/use-log-console-state';
import { useLogCorpus, type CorpusParams } from '../hooks/use-log-corpus';
import { useNewLogProbe } from '../hooks/use-new-log-probe';
import { bucketReportLogs } from '../lib/bucketReportLogs';
import { byEventAtDesc } from '../lib/eventTime';
import { groupReportLogs } from '../lib/groupReportLogs';
import { buildFacets, makeQueryMatcher, matchesFacets } from '../lib/logFacets';
import { matchesRecord } from '../lib/recordKinds';
import type { ReportLogRow } from '../lib/parseReportLog';
import { downloadTextFile, rowsToCsv } from '../lib/reportLogFormat';
import { CorpusProgress } from '../components/CorpusProgress';
import { LogConsoleShell } from '../components/LogConsoleShell';
import { LogFilterRail } from '../components/LogFilterRail';
import { MonitorStrip } from '../components/MonitorStrip';
import { NewLogsBanner } from '../components/NewLogsBanner';
import { ReportDetailPanel } from '../components/ReportDetailPanel';
import { ReportLogGroupTable } from '../components/ReportLogGroupTable';
import { ReportLogTable } from '../components/ReportLogTable';
import { ReportLogTimeChart } from '../components/ReportLogTimeChart';
import { TrackingPins } from '../components/TrackingPins';
import { RunTimeline } from '../components/RunTimeline';
import { StatsPanel } from '../components/StatsPanel';
import type { ViewMode } from '../hooks/use-log-console-state';
import type { PinKey } from '../lib/pinAxes';

/** The views, in switch order; each is named by the `tab.views.<value>` key. */
const VIEWS: ViewMode[] = ['list', 'group', 'time', 'timeline', 'stats'];

export const AllLogsTab = () => {
    const { t } = useT('allLogs');
    const navigate = useNavigate();
    const {
        server,
        client,
        mode,
        stats,
        timelineKinds,
        setRecord,
        setStats,
        toggleTimelineKind,
        pins,
        setServerAxis,
        setQuery,
        setFacet,
        setMode,
        pin,
        unpin,
        clearClientAxes,
    } = useLogConsoleState();

    const [selected, setSelected] = useState<ReportLogRow | null>(null);

    // The wire params. `kind` maps to a `stereo` value rather than being passed through —
    // errors and log entries share `stereo='log'`, so the client-side pass below is what
    // finally separates them.
    const corpusParams = useMemo<CorpusParams>(
        () => ({
            stage: server.stage,
            type: STEREO_BY_KIND[server.kind],
            from: server.from || undefined,
            to: server.to || undefined,
            level: server.level || undefined,
            uid: server.uid || undefined,
            cid: server.cid || undefined,
            runId: server.runId || undefined,
            // Empty means "no filter": an empty string would be matched literally against
            // `<field>.keyword` and come back with nothing.
            ...Object.fromEntries(ROUND_2_AXES.map(axis => [axis, server[axis] || undefined])),
        }),
        [server]
    );

    const corpus = useLogCorpus(corpusParams);

    // Newest arrival in the corpus, which is the probe's watermark. Read from the rows
    // rather than tracked separately so a merge advances it for free.
    const headCreatedAt = useMemo(
        () => corpus.rows.reduce<number | undefined>((max, row) => Math.max(max ?? 0, row.createdAt ?? 0), undefined),
        [corpus.rows]
    );

    const probe = useNewLogProbe(corpusParams, headCreatedAt, { enabled: !corpus.isCollecting });

    /**
     * Client-side narrowing over the corpus, plus the kind split the server cannot do.
     *
     * The query matcher is built once rather than per row: `matchesQuery` re-parses the
     * query on every call, which is invisible for a handful of rows and wasteful across a
     * 5,000-row corpus.
     */
    // Every client narrowing except the record filter. The timeline and the statistics view start
    // from these: the timeline shows a run's logs and statistics together (with its own toggles),
    // and the statistics view is about statistics whatever the list is set to show.
    const unrecorded = useMemo(() => {
        const matchesText = makeQueryMatcher(client.query);
        return corpus.rows
            .filter(
                row =>
                    (server.kind === 'all' || row.type === server.kind) &&
                    matchesFacets(row, client.facets) &&
                    matchesText(row)
            )
            .sort(byEventAtDesc);
    }, [corpus.rows, server.kind, client.facets, client.query]);

    const filtered = useMemo(() => {
        const matchesText = makeQueryMatcher(client.query);
        const rows = corpus.rows.filter(row => {
            // Statistics share the store with logs; the list shows logs unless asked otherwise.
            if (!matchesRecord(row, client.record)) return false;
            // Records written before reports carried a stereo are all `log`, so a legacy
            // issue lands in the `error` bucket server-side; this drops those rows.
            if (server.kind !== 'all' && row.type !== server.kind) return false;
            if (!matchesFacets(row, client.facets)) return false;
            if (!matchesText(row)) return false;
            return true;
        });
        return rows.sort(byEventAtDesc);
    }, [corpus.rows, server.kind, client.facets, client.query, client.record]);

    /** The same narrowing, reusable for anything that must predict what will show up. */
    const isVisible = useMemo(() => {
        const matchesText = makeQueryMatcher(client.query);
        // The timeline and the statistics view ignore the record filter, so the banner does too there.
        const recordApplies = mode !== 'timeline' && mode !== 'stats';
        return (row: ReportLogRow) =>
            (!recordApplies || matchesRecord(row, client.record)) &&
            (server.kind === 'all' || row.type === server.kind) &&
            matchesFacets(row, client.facets) &&
            matchesText(row);
    }, [server.kind, client.facets, client.query, client.record, mode]);

    // Facets are built from the corpus, not from `filtered`: a facet list that shrank as
    // you selected from it would strand you with no way back to the other values.
    // Over the records the list can show: a value only statistics carry (`perf.chat_room_open`)
    // offered while the list shows logs would empty it with no hint why.
    const facets = useMemo(
        () =>
            buildFacets(
                mode === 'list' || mode === 'group' || mode === 'time'
                    ? corpus.rows.filter(row => matchesRecord(row, client.record))
                    : corpus.rows
            ),
        [corpus.rows, client.record, mode]
    );

    const groups = useMemo(() => (mode === 'group' ? groupReportLogs(filtered) : []), [mode, filtered]);
    const buckets = useMemo(() => (mode === 'time' ? bucketReportLogs(filtered) : []), [mode, filtered]);

    const pinned = useMemo(
        () => Object.fromEntries(pins.map(p => [p.key, p.value])) as Partial<Record<PinKey, string>>,
        [pins]
    );

    const onObserve = (uid: string) => navigate(`/socket-lab?observe=${encodeURIComponent(uid)}`);

    /**
     * What the operator will actually see appear.
     *
     * The probe only knows the server axes, so a strict count of its finds can promise
     * rows the client-side narrowing then hides — click it, nothing changes, and the
     * merge looks broken. Counting through the same predicate keeps the promise true;
     * every fetched row is still merged, so nothing is dropped from the corpus.
     */
    const incomingVisible = useMemo(() => probe.rows.filter(isVisible).length, [probe.rows, isVisible]);

    /**
     * Take the banner's rows, or re-collect when the probe's window overflowed.
     *
     * An overflowed window means there are more arrivals than one page holds, so merging
     * would advance the watermark past the rows that did not fit and strand them
     * permanently. A fresh walk is the only way to get them.
     */
    /**
     * Collect again from scratch — what the operator means by refreshing.
     *
     * The probe is reset as part of it, not left alone: its finds are measured against the
     * watermark of the corpus that is being replaced, so keeping them would announce rows the new
     * walk is already bringing in. A banner offering rows that are about to appear anyway reads as
     * the merge being broken.
     */
    const reload = () => {
        probe.reset();
        corpus.reload();
    };

    const acceptIncoming = () => {
        if (probe.overflowed) {
            reload();
            return;
        }
        corpus.appendHead(probe.take());
    };

    /** Range bounds in ms, so rows outside them can say so. Dates are local-day starts. */
    const range = useMemo(() => {
        const startOf = (date: string) => (date ? new Date(`${date}T00:00:00`).getTime() : undefined);
        const endOf = (date: string) => (date ? new Date(`${date}T23:59:59.999`).getTime() : undefined);
        return { fromMs: startOf(server.from), toMs: endOf(server.to) };
    }, [server.from, server.to]);

    const header = (
        <>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <CorpusProgress
                    phase={corpus.phase}
                    loaded={corpus.loaded}
                    total={corpus.total}
                    cap={corpus.cap}
                    error={corpus.error}
                    fetchedAt={corpus.fetchedAt}
                    onRetry={reload}
                />
                <div className="flex flex-wrap items-center gap-2">
                    <div
                        role="group"
                        aria-label={t('tab.viewsLabel')}
                        className="flex flex-wrap rounded-md border border-border p-0.5 text-sm"
                    >
                        {VIEWS.map(view => (
                            <button
                                key={view}
                                type="button"
                                onClick={() => setMode(view)}
                                // Without this the active view is conveyed by background
                                // colour alone.
                                aria-pressed={mode === view}
                                className={`rounded px-3 py-1 ${
                                    mode === view
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:bg-muted'
                                }`}
                            >
                                {t(`tab.views.${view}`)}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() =>
                            // The range is optional, so the filename says `all` rather than
                            // trailing a bare dash when no start date is set.
                            downloadTextFile(
                                `log-console-${server.stage}-${server.from || 'all'}.csv`,
                                rowsToCsv(filtered)
                            )
                        }
                        // The statistics view has its own table; the export is of the list.
                        disabled={filtered.length === 0 || mode === 'stats'}
                        title={t('tab.csvTitle')}
                        className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                    >
                        {t('tab.csv')}
                    </button>
                    <button
                        type="button"
                        onClick={reload}
                        disabled={corpus.isCollecting}
                        className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                    >
                        {corpus.isCollecting ? t('tab.collecting') : t('tab.recollect')}
                    </button>
                </div>
            </div>
            {/* `uidCaveat`: Slack reports are not stamped with a `uid`, so a uid pin reaches
                the user's log entries but not their own issue reports. Said only when it
                could actually mislead — a uid is pinned and reports are in scope. */}
            <TrackingPins pins={pins} onUnpin={unpin} uidCaveat={server.kind === 'all' || server.kind === 'issue'} />
            <div className="flex flex-wrap items-center justify-between gap-3">
                <MonitorStrip rows={filtered} corpusSize={corpus.loaded} />
                <NewLogsBanner count={incomingVisible} overflowed={probe.overflowed} onAccept={acceptIncoming} />
            </div>
        </>
    );

    const main = (() => {
        if (corpus.phase === 'collecting' && corpus.loaded === 0) {
            return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t('tab.collecting')}</p>;
        }
        if (mode === 'group') return <ReportLogGroupTable groups={groups} onSelect={g => setSelected(g.sample)} />;
        if (mode === 'time') return <ReportLogTimeChart buckets={buckets} />;
        if (mode === 'stats') {
            return <StatsPanel rows={unrecorded} view={stats} onView={setStats} partial={corpus.isTruncated} />;
        }
        if (mode === 'timeline') {
            return (
                <RunTimeline
                    rows={unrecorded}
                    onSelect={setSelected}
                    selectedId={selected?.id}
                    runId={server.runId || undefined}
                    kinds={timelineKinds}
                    onToggleKind={toggleTimelineKind}
                />
            );
        }
        return (
            <ReportLogTable
                rows={filtered}
                onSelect={setSelected}
                selectedId={selected?.id}
                onPin={pin}
                onUnpin={unpin}
                pinned={pinned}
                range={range}
            />
        );
    })();

    return (
        <LogConsoleShell
            header={header}
            rail={
                <LogFilterRail
                    server={server}
                    onServerAxis={setServerAxis}
                    query={client.query}
                    onQuery={setQuery}
                    facets={facets}
                    selection={client.facets}
                    onFacet={setFacet}
                    onClearClient={clearClientAxes}
                    record={client.record}
                    onRecord={setRecord}
                    corpusSize={corpus.loaded}
                />
            }
            main={main}
            detail={
                <ReportDetailPanel
                    row={selected}
                    onClose={() => setSelected(null)}
                    onObserve={onObserve}
                    onPin={pin}
                    onUnpin={unpin}
                    pinned={pinned}
                />
            }
        />
    );
};
