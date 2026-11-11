/**
 * `tabs/ErrorsTab.tsx`
 * - "Is something breaking right now, and for how many people?"
 *
 * Errors are grouped into incidents by tag, ranked by how often they happened, each with the people
 * affected, when it started and last happened, and its shape over the period. Opening one lists its
 * cases, and each case leads to that person's timeline — the same path support takes from the other
 * direction.
 *
 * Counts come from the server's aggregation whenever the fetched page cannot cover the period
 * (`lib/errorGroups` decides, and says so on screen). Cases come from a fetch narrowed to the one
 * tag on the server, so an incident's list is not limited to whatever of it landed in the newest
 * page of all errors.
 */
import { useMemo, useState } from 'react';

import { ArrowLeft, ChevronRight } from 'lucide-react';

import { useT } from '../../../i18n';
import { EmptyState } from '../components/console/EmptyState';
import { FetchNotice } from '../components/console/FetchNotice';
import { PeriodPicker } from '../components/console/PeriodPicker';
import { Stamp } from '../components/console/Stamp';
import { Metric, Page, Panel, quietButton, SectionTitle } from '../components/console/ui';
import { ReportDetailPanel } from '../components/ReportDetailPanel';
import type { ConsoleNav } from '../hooks/use-console-nav';
import { useLogCorpus } from '../hooks/use-log-corpus';
import { useLogStats } from '../hooks/use-log-stats';
import { eventLabelOf } from '../lib/describeRow';
import { buildErrorOverview, coversWindow, type TrendBucket } from '../lib/errorGroups';
import { byEventAtDesc, eventAt } from '../lib/eventTime';
import { formatOs, type ReportLogRow } from '../lib/parseReportLog';
import { inWindow, widerPreset, type ResolvedPeriod } from '../lib/period';
import { formatDateTime, formatNumber } from '../lib/timeFormat';

interface ErrorsTabProps {
    nav: ConsoleNav;
}

/** How many incidents the server is asked to count, most frequent first. */
const GROUP_LIMIT = 50;

/** Server buckets: hourly up to two days, daily beyond — enough bars to see a shape, not a wall. */
const intervalFor = (period: ResolvedPeriod) => (period.toMs - period.fromMs <= 2 * 86_400_000 ? 'hour' : 'day');

const Sparkline = ({ values, label }: { values: number[]; label: string }) => {
    const max = Math.max(1, ...values);
    return (
        <span className="flex h-8 w-32 items-end gap-[2px]" role="img" aria-label={label}>
            {values.map((value, i) => (
                <span
                    key={i}
                    className={value > 0 ? 'flex-1 rounded-[2px] bg-red-500/70' : 'flex-1 rounded-[2px] bg-border'}
                    style={{ height: value > 0 ? `${Math.max(18, (value / max) * 100)}%` : '2px' }}
                />
            ))}
        </span>
    );
};

const TrendBars = ({ buckets }: { buckets: TrendBucket[] }) => {
    const { t, lng } = useT('errors');
    if (buckets.length === 0) return null;
    const max = Math.max(1, ...buckets.map(b => b.count));
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex h-24 items-end gap-1" role="img" aria-label={t('summary.trendLabel')}>
                {buckets.map(bucket => (
                    <div
                        key={bucket.start}
                        className={bucket.count > 0 ? 'flex-1 rounded-t bg-red-500/60' : 'flex-1 rounded-t bg-border'}
                        style={{ height: bucket.count > 0 ? `${Math.max(6, (bucket.count / max) * 100)}%` : '2px' }}
                        title={`${formatDateTime(bucket.start, lng)} · ${formatNumber(bucket.count, lng)}`}
                    />
                ))}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatDateTime(buckets[0].start, lng)}</span>
                <span>{formatDateTime(buckets[buckets.length - 1].start, lng)}</span>
            </div>
        </div>
    );
};

const CaseList = ({
    tag,
    nav,
    onDetails,
}: {
    tag: string;
    nav: ConsoleNav;
    onDetails: (row: ReportLogRow) => void;
}) => {
    const { t, lng } = useT('errors');
    const { period } = nav;
    const base = { stage: nav.stage, from: period.fromDate, to: period.toDate, level: 'error', tag };
    const cases = useLogCorpus(base);
    const tagStats = useLogStats({ ...base, users: true });
    const rows = useMemo(
        () => cases.rows.filter(row => inWindow(eventAt(row), period)).sort(byEventAtDesc),
        [cases.rows, period]
    );
    // Same rule as the incident list: the fetched cases are the answer when they hold the whole
    // window. The server's count covers whole days, so it stands in only for a day-shaped period —
    // for a rolling one it would be a count over a wider span than the screen says.
    const covered = coversWindow(cases.rows, cases.isTruncated, period.fromMs);
    const useServer = !covered && tagStats.supported && period.exact;
    const count = useServer ? (tagStats.total ?? rows.length) : rows.length;
    const users =
        useServer && tagStats.stats?.users !== undefined
            ? tagStats.stats.users
            : new Set(rows.map(row => row.userId).filter(Boolean)).size;
    const partial = !covered && !useServer;

    return (
        <>
            <button
                type="button"
                onClick={() => nav.patch({ event: '' })}
                className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-primary hover:underline"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden /> {t('cases.back')}
            </button>
            <Panel className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-1">
                    <h2 className="text-xl font-semibold text-foreground">{eventLabelOf(tag, lng)}</h2>
                    <p className="font-mono text-xs text-muted-foreground" title={t('cases.rawTag')}>
                        {tag}
                    </p>
                </div>
                <div className="flex gap-8">
                    <Metric
                        label={t('summary.count')}
                        value={`${formatNumber(count, lng)}${partial ? '+' : ''}`}
                        tone="error"
                    />
                    <Metric label={t('summary.users')} value={`${formatNumber(users, lng)}${partial ? '+' : ''}`} />
                </div>
            </Panel>
            <FetchNotice corpus={cases} />
            <section className="flex flex-col gap-3">
                <SectionTitle title={t('cases.title')} hint={t('cases.hint')} />
                {cases.phase !== 'collecting' && rows.length === 0 ? (
                    <Panel>
                        <EmptyState title={t('cases.empty')} />
                    </Panel>
                ) : (
                    <Panel className="overflow-hidden">
                        <ul className="divide-y divide-border">
                            {rows.map((row, index) => {
                                const device = [row.model, formatOs(row.os, row.osVersion), row.appVersion]
                                    .filter(Boolean)
                                    .join(' · ');
                                return (
                                    <li
                                        key={row.id || index}
                                        className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-6"
                                    >
                                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                                            <span className="break-words text-sm leading-6 text-foreground">
                                                {row.message ?? row.title}
                                            </span>
                                            <span className="flex flex-wrap gap-x-2 text-[13px] text-muted-foreground">
                                                <span className="font-medium text-foreground/80">
                                                    {row.userId
                                                        ? t('common:user.anonymous', { id: row.userId })
                                                        : t('common:user.unknown')}
                                                </span>
                                                <span aria-hidden>·</span>
                                                <Stamp ms={eventAt(row)} />
                                                {device && (
                                                    <>
                                                        <span aria-hidden>·</span>
                                                        <span>{device}</span>
                                                    </>
                                                )}
                                            </span>
                                        </div>
                                        <div className="flex shrink-0 flex-wrap gap-2">
                                            {row.userId && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const at = eventAt(row);
                                                        nav.go('user', {
                                                            uid: row.userId ?? '',
                                                            ...(at ? { at: String(at) } : {}),
                                                        });
                                                    }}
                                                    className={quietButton}
                                                    title={row.userId}
                                                >
                                                    {t('cases.userTimeline')}
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => onDetails(row)}
                                                className={quietButton}
                                            >
                                                {t('common:actions.details')}
                                            </button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </Panel>
                )}
            </section>
        </>
    );
};

export const ErrorsTab = ({ nav }: ErrorsTabProps) => {
    const { t, lng } = useT('errors');
    const { period } = nav;
    const selectedTag = nav.param('event');
    const [selected, setSelected] = useState<ReportLogRow | null>(null);

    const base = { stage: nav.stage, from: period.fromDate, to: period.toDate, level: 'error' };
    const corpus = useLogCorpus(base, { enabled: !selectedTag });
    const stats = useLogStats(
        { ...base, groupBy: ['tag'], aggrSize: GROUP_LIMIT, interval: intervalFor(period), users: true },
        { enabled: !selectedTag }
    );

    const overview = useMemo(
        () =>
            buildErrorOverview({
                rows: corpus.rows,
                truncated: corpus.isTruncated,
                period,
                stats: stats.stats,
                serverTotal: stats.total,
            }),
        [corpus.rows, corpus.isTruncated, period, stats.stats, stats.total]
    );

    const wider = widerPreset(period.preset);
    const loading = corpus.phase === 'collecting' && corpus.loaded === 0;
    // The server was asked for the top GROUP_LIMIT incidents; a full list means there may be more.
    const incidentsCapped = overview.source === 'server' && overview.groups.length >= GROUP_LIMIT;

    const sourceNote =
        overview.source === 'server'
            ? overview.wideSpan
                ? t('source.serverWide', { from: period.fromDate, to: period.toDate })
                : t('source.server')
            : overview.partial
              ? t('source.rowsPartial', { n: formatNumber(corpus.loaded, lng) })
              : t('source.rows');

    return (
        <Page aside={selected && <ReportDetailPanel row={selected} onClose={() => setSelected(null)} />}>
            <Panel className="p-5">
                <PeriodPicker
                    period={period}
                    from={nav.param('from') || undefined}
                    to={nav.param('to') || undefined}
                    onChange={nav.setPeriod}
                />
            </Panel>
            {selectedTag ? (
                <CaseList tag={selectedTag} nav={nav} onDetails={setSelected} />
            ) : (
                <>
                    <Panel className="flex flex-col gap-5 p-5">
                        <div className="flex flex-wrap gap-x-10 gap-y-4">
                            <Metric
                                size="lg"
                                label={t('summary.count')}
                                value={formatNumber(overview.total, lng)}
                                tone="error"
                            />
                            {overview.users !== undefined && (
                                <Metric
                                    size="lg"
                                    label={t('summary.users')}
                                    value={formatNumber(overview.users, lng)}
                                />
                            )}
                            <Metric
                                size="lg"
                                label={t('summary.incidents')}
                                value={`${formatNumber(overview.groups.length, lng)}${incidentsCapped ? '+' : ''}`}
                            />
                        </div>
                        <TrendBars buckets={overview.trend} />
                        <p className="text-[13px] leading-relaxed text-muted-foreground">{sourceNote}</p>
                    </Panel>
                    {corpus.phase === 'failed' && <FetchNotice corpus={corpus} />}
                    <section className="flex flex-col gap-3">
                        <SectionTitle title={t('group.title')} hint={t('group.hint')} />
                        {loading ? (
                            <p className="text-sm text-muted-foreground">{t('common:fetch.loading')}</p>
                        ) : overview.groups.length === 0 ? (
                            <Panel>
                                <EmptyState
                                    title={t('empty.title')}
                                    hint={t('empty.hint')}
                                    action={
                                        wider
                                            ? { label: t('common:empty.widen'), onClick: () => nav.setPeriod(wider) }
                                            : undefined
                                    }
                                />
                            </Panel>
                        ) : (
                            <Panel className="overflow-hidden">
                                <ul className="divide-y divide-border">
                                    {overview.groups.map(group => (
                                        <li key={group.tag}>
                                            <button
                                                type="button"
                                                onClick={() => nav.patch({ event: group.tag })}
                                                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-5 py-4 text-left hover:bg-muted/40 md:grid-cols-[minmax(0,1fr)_8rem_6.5rem_1rem]"
                                            >
                                                <span className="flex min-w-0 flex-col gap-1">
                                                    <span
                                                        className="truncate text-[15px] font-semibold text-foreground"
                                                        title={group.tag}
                                                    >
                                                        {eventLabelOf(group.tag, lng)}
                                                    </span>
                                                    <span className="truncate text-sm text-muted-foreground">
                                                        {group.latest?.message ?? group.tag}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {group.firstAt !== undefined && (
                                                            <>
                                                                {t('group.first')} {formatDateTime(group.firstAt, lng)}
                                                                {'  ·  '}
                                                            </>
                                                        )}
                                                        {group.lastAt !== undefined && (
                                                            <>
                                                                {t('group.last')} <Stamp ms={group.lastAt} agoFirst />
                                                            </>
                                                        )}
                                                    </span>
                                                </span>
                                                <span className="hidden md:block">
                                                    <Sparkline values={group.spark} label={t('group.sparkLabel')} />
                                                </span>
                                                <span className="flex flex-col items-end gap-0.5 text-right">
                                                    <span className="text-base font-semibold tabular-nums text-red-600 dark:text-red-400">
                                                        {t('group.count', { n: formatNumber(group.count, lng) })}
                                                    </span>
                                                    <span className="text-xs tabular-nums text-muted-foreground">
                                                        {t(overview.partial ? 'group.usersAtLeast' : 'group.users', {
                                                            n: formatNumber(group.users, lng),
                                                        })}
                                                    </span>
                                                </span>
                                                <ChevronRight
                                                    className="hidden h-4 w-4 text-muted-foreground md:block"
                                                    aria-hidden
                                                />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </Panel>
                        )}
                    </section>
                </>
            )}
        </Page>
    );
};
