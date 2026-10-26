/**
 * `tabs/UserTab.tsx`
 * - The console's front door: "a user says it broke — what happened to them?"
 *
 * Find the user (by id, or among the people seen in the period), then read their visits to the app
 * one card per run, each opening into a timeline of plain sentences with errors and reports picked
 * out. Everything a support person needs is on the card; the record ids, run ids and raw tags an
 * engineer needs are one "details" click away, never in the way.
 *
 * Fetches, each the existing one-page corpus: the user's own records (server-filtered by `uid`), the
 * period's issue reports (reports carry no top-level `uid`, so they are matched here by the reporter
 * id inside them — shared with the reports tab's cache), and, before a user is chosen, the period's
 * records of everyone, for the "recently active" list.
 *
 * **A uid is per cloud.** Each cloud numbers its users from the start, so one id can be several
 * people. When a user's records span clouds, a cloud row narrows to one — through the server's `cid`
 * filter, so the narrowed fetch is not limited to whatever of that cloud fit in the unfiltered page.
 * The unfiltered fetch stays on to list the clouds.
 */
import { useEffect, useMemo, useState } from 'react';

import { ChevronDown, ChevronRight, Search } from 'lucide-react';

import { useT } from '../../../i18n';
import { STEREO_BY_KIND } from '../api/reportLogApi';
import { EmptyState } from '../components/console/EmptyState';
import { FetchNotice } from '../components/console/FetchNotice';
import { PeriodPicker } from '../components/console/PeriodPicker';
import { Stamp } from '../components/console/Stamp';
import { TONE_ROW } from '../components/console/tone';
import {
    ChoiceRow,
    Metric,
    Page,
    Panel,
    Pill,
    primaryButton,
    quietButton,
    SectionTitle,
} from '../components/console/ui';
import { ReportDetailPanel } from '../components/ReportDetailPanel';
import type { ConsoleNav } from '../hooks/use-console-nav';
import { useLogCorpus } from '../hooks/use-log-corpus';
import { describeRow } from '../lib/describeRow';
import { eventAt } from '../lib/eventTime';
import { formatOs, type ReportLogRow } from '../lib/parseReportLog';
import { inWindow, widerPreset } from '../lib/period';
import { recordKindOf } from '../lib/recordKinds';
import {
    formatAgo,
    formatClock,
    formatDateTime,
    formatDay,
    formatDuration,
    formatNumber,
    formatTime,
} from '../lib/timeFormat';
import {
    cloudsOf,
    groupRuns,
    recentUsers,
    reportCloudOf,
    runAt,
    summarizeUser,
    type DeviceInfo,
    type RunSummary,
} from '../lib/userActivity';

interface UserTabProps {
    nav: ConsoleNav;
}

/** Hidden unless asked for: debug lines and performance measurements are not what support reads. */
const isDetailOnly = (row: ReportLogRow): boolean => {
    const kind = recordKindOf(row);
    return row.level === 'debug' || kind === 'trace' || kind === 'sample';
};

const DeviceLine = ({ device }: { device: DeviceInfo }) => {
    const { t } = useT('user');
    const parts = [
        device.model,
        formatOs(device.os, device.osVersion),
        device.appVersion && t('device.app', { version: device.appVersion }),
        device.webVersion && t('device.web', { version: device.webVersion }),
    ].filter(Boolean);
    if (parts.length === 0) return <span>{t('device.unknown')}</span>;
    return <span>{parts.join(' · ')}</span>;
};

interface RunCardProps {
    run: RunSummary;
    open: boolean;
    onToggle: () => void;
    verbose: boolean;
    onDetails: (row: ReportLogRow) => void;
    onOpenReport: (row: ReportLogRow) => void;
}

const RunCard = ({ run, open, onToggle, verbose, onDetails, onOpenReport }: RunCardProps) => {
    const { t, lng } = useT('user');
    const lines = verbose ? run.rows : run.rows.filter(row => !isDetailOnly(row));
    const hidden = run.rows.length - lines.length;
    const span = run.startAt !== undefined && run.endAt !== undefined ? run.endAt - run.startAt : undefined;
    const isReportOnly = !run.runId && run.key !== 'no-run';
    const Chevron = open ? ChevronDown : ChevronRight;

    return (
        <li>
            <Panel className="overflow-hidden">
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={onToggle}
                    className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-muted/40"
                >
                    <Chevron className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="text-[15px] font-semibold text-foreground">
                                {isReportOnly
                                    ? t('run.reportOnly')
                                    : run.runId
                                      ? t('run.title', {
                                            day: formatDay(run.startAt, lng),
                                            from: formatTime(run.startAt, lng),
                                            to: formatTime(run.endAt, lng),
                                        })
                                      : t('run.noRun')}
                            </span>
                            <span
                                className="text-[13px] text-muted-foreground"
                                title={formatDateTime(run.startAt, lng, { seconds: true })}
                            >
                                {formatAgo(run.startAt, lng)}
                            </span>
                        </span>
                        <span className="text-[13px] text-muted-foreground">
                            {span !== undefined && span > 0 && (
                                <>{t('run.duration', { duration: formatDuration(span, lng) })} · </>
                            )}
                            <DeviceLine device={run.device} />
                        </span>
                    </span>
                    <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
                        {run.errors > 0 && <Pill tone="error">{t('run.errors', { count: run.errors })}</Pill>}
                        {run.reports > 0 && <Pill tone="report">{t('run.reports', { count: run.reports })}</Pill>}
                        <Pill>{t('run.records', { count: run.rows.length })}</Pill>
                    </span>
                </button>
                {open && (
                    <div className="border-t border-border bg-background/40 px-3 py-3 sm:px-4">
                        <ol className="flex flex-col gap-1" aria-label={t('run.timelineLabel')}>
                            {lines.map((row, index) => {
                                const sentence = describeRow(row, t, lng);
                                const flagged = sentence.tone === 'error' || sentence.tone === 'report';
                                return (
                                    <li
                                        key={row.id || index}
                                        className={`grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-start gap-3 rounded-lg border-l-[3px] py-2 pl-3 pr-2 ${TONE_ROW[sentence.tone]}`}
                                    >
                                        <span className="pt-0.5 font-mono text-xs text-muted-foreground">
                                            {formatClock(eventAt(row), lng)}
                                        </span>
                                        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                                            {flagged && (
                                                <Pill tone={sentence.tone === 'error' ? 'error' : 'report'}>
                                                    {t(sentence.tone === 'error' ? 'line.error' : 'line.report')}
                                                </Pill>
                                            )}
                                            <span
                                                className={`min-w-0 break-words text-sm leading-6 ${
                                                    sentence.tone === 'stat'
                                                        ? 'text-muted-foreground'
                                                        : 'text-foreground'
                                                }`}
                                                title={sentence.raw}
                                            >
                                                {sentence.text}
                                            </span>
                                        </span>
                                        {sentence.tone === 'error' && (
                                            <button
                                                type="button"
                                                onClick={() => onDetails(row)}
                                                className={quietButton}
                                            >
                                                {t('actions.details')}
                                            </button>
                                        )}
                                        {sentence.tone === 'report' && (
                                            <button
                                                type="button"
                                                onClick={() => onOpenReport(row)}
                                                className={quietButton}
                                            >
                                                {t('actions.openReport')}
                                            </button>
                                        )}
                                    </li>
                                );
                            })}
                        </ol>
                        {hidden > 0 && (
                            <p className="px-3 pt-3 text-[13px] text-muted-foreground">
                                {t('run.hidden', { count: hidden })}
                            </p>
                        )}
                    </div>
                )}
            </Panel>
        </li>
    );
};

/** The `run` value for "every card closed". */
const CLOSED = '-';

/** "All clouds" in the cloud row; never a real cloud id. */
const ALL_CLOUDS = '';

export const UserTab = ({ nav }: UserTabProps) => {
    const { t, lng } = useT('user');
    const { period } = nav;
    const uid = nav.param('uid');
    const cloud = nav.param('cloud');
    const verbose = nav.param('verbose') === '1';
    const [selected, setSelected] = useState<ReportLogRow | null>(null);

    // The box holds a draft so typing narrows the recent list without touching the URL; only a
    // submitted id becomes the server filter.
    const [draft, setDraft] = useState(uid);
    useEffect(() => setDraft(uid), [uid]);

    const base = { stage: nav.stage, from: period.fromDate, to: period.toDate };
    const allClouds = useLogCorpus({ ...base, uid: uid || undefined }, { enabled: !!uid });
    const oneCloud = useLogCorpus(
        { ...base, uid: uid || undefined, cid: cloud || undefined },
        { enabled: !!uid && !!cloud }
    );
    const userCorpus = cloud ? oneCloud : allClouds;
    const reportCorpus = useLogCorpus({ ...base, type: STEREO_BY_KIND.issue }, { enabled: !!uid });
    const everyone = useLogCorpus(base, { enabled: !uid });

    const rows = useMemo(
        // The user check is a guard: rows held for another user must never be shown under this one.
        () => userCorpus.rows.filter(row => row.userId === uid && inWindow(eventAt(row), period)),
        [userCorpus.rows, uid, period]
    );
    const reports = useMemo(
        () =>
            reportCorpus.rows.filter(
                row =>
                    !!uid &&
                    row.userId === uid &&
                    inWindow(eventAt(row), period) &&
                    (!cloud || reportCloudOf(row) === cloud)
            ),
        [reportCorpus.rows, uid, period, cloud]
    );
    const clouds = useMemo(() => cloudsOf(allClouds.rows), [allClouds.rows]);
    const runs = useMemo(() => groupRuns(rows, reports), [rows, reports]);
    const summary = useMemo(() => summarizeUser(uid, rows, reports), [uid, rows, reports]);
    const candidates = useMemo(
        () =>
            recentUsers(
                everyone.rows.filter(row => inWindow(eventAt(row), period)),
                draft
            ),
        [everyone.rows, period, draft]
    );

    // A run named in the URL is open; arriving from a report opens the run that was going on then.
    const at = nav.periodInput.preset === 'around' ? nav.periodInput.at : undefined;
    // `-` records "closed on purpose", so a run opened by `at` can be closed again.
    const runParam = nav.param('run');
    const openKey = runParam === CLOSED ? undefined : runParam || (at !== undefined ? runAt(runs, at)?.key : undefined);

    // A new user starts from the tab's own period, not the half hour around someone else's report.
    const choose = (next: string) => nav.patch({ uid: next.trim(), cloud: '', run: '', at: '' });
    const wider = widerPreset(period.preset);
    const widen = wider ? { label: t('common:empty.widen'), onClick: () => nav.setPeriod(wider) } : undefined;

    const toolbar = (
        <Panel className="flex flex-col gap-4 p-5">
            <form
                role="search"
                onSubmit={event => {
                    event.preventDefault();
                    if (draft.trim()) choose(draft);
                }}
                className="flex flex-wrap items-center gap-2"
            >
                <label className="relative min-w-[16rem] flex-1">
                    <span className="sr-only">{t('search.label')}</span>
                    <Search
                        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden
                    />
                    <input
                        type="search"
                        value={draft}
                        onChange={event => setDraft(event.target.value)}
                        placeholder={t('search.placeholder')}
                        className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-3 text-[15px] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </label>
                <button type="submit" className={`${primaryButton} py-2.5`}>
                    {t('search.submit')}
                </button>
                {uid && (
                    <button type="button" onClick={() => choose('')} className={`${quietButton} py-2.5 text-sm`}>
                        {t('search.clear')}
                    </button>
                )}
            </form>
            <PeriodPicker
                period={period}
                from={nav.param('from') || undefined}
                to={nav.param('to') || undefined}
                onChange={nav.setPeriod}
            />
        </Panel>
    );

    const recent = (
        <section className="flex flex-col gap-4">
            <SectionTitle title={t('recent.title')} hint={t('recent.hint')} />
            <FetchNotice corpus={everyone} />
            {everyone.phase !== 'collecting' && candidates.length === 0 ? (
                <Panel>
                    <EmptyState
                        title={draft ? t('recent.noMatch') : t('common:empty.noRecords')}
                        hint={draft ? t('recent.noMatchHint') : undefined}
                        action={
                            draft
                                ? { label: t('recent.searchExact', { id: draft.trim() }), onClick: () => choose(draft) }
                                : widen
                        }
                    />
                </Panel>
            ) : (
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {candidates.map(user => (
                        <li key={user.uid}>
                            <button
                                type="button"
                                onClick={() => choose(user.uid)}
                                className="flex h-full w-full flex-col gap-2 rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:border-primary/60 hover:bg-muted/30"
                            >
                                <span className="flex items-start justify-between gap-2">
                                    <span
                                        className="truncate text-[15px] font-semibold text-foreground"
                                        title={user.uid}
                                    >
                                        {user.name ?? t('common:user.anonymous', { id: user.uid })}
                                    </span>
                                    {user.errors > 0 && (
                                        <Pill tone="error">{t('run.errors', { count: user.errors })}</Pill>
                                    )}
                                </span>
                                <span className="truncate text-[13px] text-muted-foreground">
                                    <DeviceLine device={user.device} />
                                </span>
                                <Stamp ms={user.lastSeenAt} agoFirst className="text-xs text-muted-foreground" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );

    const loading = userCorpus.phase === 'collecting' && userCorpus.loaded === 0;
    const profile = (
        <>
            <Panel className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-col gap-1.5">
                    <h2 className="truncate text-xl font-semibold text-foreground" title={uid}>
                        {summary.name ?? t('common:user.anonymous', { id: uid })}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        <DeviceLine device={summary.device} />
                    </p>
                    {summary.lastSeenAt !== undefined && (
                        <p className="text-[13px] text-muted-foreground">
                            {t('card.lastSeen')} <Stamp ms={summary.lastSeenAt} agoFirst />
                        </p>
                    )}
                </div>
                <div className="flex flex-wrap gap-x-8 gap-y-4">
                    <Metric label={t('card.runs')} value={formatNumber(summary.runs, lng)} />
                    <Metric
                        label={t('card.errors')}
                        value={formatNumber(summary.errors, lng)}
                        tone={summary.errors > 0 ? 'error' : 'plain'}
                    />
                    <Metric
                        label={t('card.reports')}
                        value={formatNumber(summary.reports, lng)}
                        tone={summary.reports > 0 ? 'report' : 'plain'}
                    />
                </div>
            </Panel>
            {(clouds.length > 1 || cloud) && (
                <Panel className="flex flex-col gap-3 p-5">
                    <p className="text-[13px] leading-relaxed text-amber-800 dark:text-amber-300">
                        {t('cloud.mixed', { count: clouds.length })}
                    </p>
                    <ChoiceRow
                        label={t('cloud.label')}
                        value={cloud}
                        options={[
                            { value: ALL_CLOUDS, label: t('cloud.all') },
                            ...[...new Set([...clouds.map(c => c.cid), ...(cloud ? [cloud] : [])])].map(cid => {
                                const named = clouds.find(c => c.cid === cid);
                                return {
                                    value: cid,
                                    label: named?.name ?? t('cloud.one', { id: cid }),
                                    title: cid,
                                };
                            }),
                        ]}
                        onChange={next => nav.patch({ cloud: next, run: '' })}
                    />
                </Panel>
            )}
            <FetchNotice corpus={userCorpus} />
            {reportCorpus.isTruncated && (
                <p className="text-[13px] text-muted-foreground">
                    {t('runs.reportsPartial', { n: formatNumber(reportCorpus.loaded, lng) })}
                </p>
            )}
            {loading ? null : runs.length === 0 ? (
                <Panel>
                    <EmptyState title={t('empty.title')} hint={t('empty.hint')} action={widen} />
                </Panel>
            ) : (
                <section className="flex flex-col gap-4">
                    <SectionTitle
                        title={t('runs.title', { n: formatNumber(runs.length, lng) })}
                        hint={t('runs.hint')}
                        action={
                            <div className="flex flex-wrap items-center gap-4 text-sm">
                                <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                                    <input
                                        type="checkbox"
                                        checked={verbose}
                                        onChange={event => nav.patch({ verbose: event.target.checked ? '1' : '' })}
                                        className="h-4 w-4"
                                    />
                                    {t('runs.verbose')}
                                </label>
                                <button
                                    type="button"
                                    onClick={() =>
                                        nav.go('all', { uid, cid: cloud, from: period.fromDate, to: period.toDate })
                                    }
                                    className="font-medium text-primary underline-offset-4 hover:underline"
                                >
                                    {t('runs.openInAll')}
                                </button>
                            </div>
                        }
                    />
                    <ul className="flex flex-col gap-3">
                        {runs.map(run => (
                            <RunCard
                                key={run.key}
                                run={run}
                                open={openKey === run.key}
                                onToggle={() => nav.patch({ run: openKey === run.key ? CLOSED : run.key })}
                                verbose={verbose}
                                onDetails={setSelected}
                                onOpenReport={row =>
                                    nav.go('reports', {
                                        report: row.id,
                                        period: 'custom',
                                        from: period.fromDate,
                                        to: period.toDate,
                                    })
                                }
                            />
                        ))}
                    </ul>
                </section>
            )}
        </>
    );

    return (
        <Page aside={selected && <ReportDetailPanel row={selected} onClose={() => setSelected(null)} />}>
            {toolbar}
            {uid ? profile : recent}
        </Page>
    );
};
