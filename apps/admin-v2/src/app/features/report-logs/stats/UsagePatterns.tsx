/**
 * `stats/UsagePatterns.tsx`
 * - The statistics tab's "how do people use the app?" view: who used it and how often, per day and
 *   by hour of the day, how long a visit lasts, which screens are used, and how visits start.
 *
 * Counts of people and app opens are the server's, over the whole match — whole Korean days by
 * arrival, so a period narrower than its days says which days the numbers cover. What the server
 * cannot count (a visit's length, time on a screen, how a visit started) is read from the usage
 * events themselves. Those are kept on every run, so a count of them is a count, not an estimate —
 * but a fetch stops at the newest page, and a section says so when it read only that part.
 */
import { useMemo, type ReactNode } from 'react';

import { useT } from '../../../i18n';
import { ColumnChart, ShareBars, type Column, type Share } from '../components/console/charts';
import { EmptyState } from '../components/console/EmptyState';
import { Metric, Panel, SectionTitle } from '../components/console/ui';
import type { ConsoleNav } from '../hooks/use-console-nav';
import { useLogStats } from '../hooks/use-log-stats';
import { useStatRows } from '../hooks/use-stat-rows';
import { kstDate, widerPreset } from '../lib/period';
import { formatDateTime, formatDay, formatDuration, formatNumber } from '../lib/timeFormat';
import {
    busiestHour,
    fillTrend,
    foldByHourOfDay,
    kstHourOf,
    summarizeScreens,
    summarizeSessions,
    summarizeStarts,
    trendUnitOf,
    type Count,
    type TrendBucket,
} from '../lib/usagePatterns';

interface UsagePatternsProps {
    nav: ConsoleNav;
}

const OPEN_TAG = 'usage.session_start';

const START_KINDS = ['cold', 'warm', 'resume'];
const ENTRY_KINDS = ['icon', 'push', 'deeplink', 'browser'];

const Muted = ({ children }: { children: ReactNode }) => (
    <p className="text-[13px] leading-relaxed text-muted-foreground">{children}</p>
);

const Failure = ({ message }: { message: string }) => (
    <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {message}
    </p>
);

/** "10/26" — short enough to sit under a column; the tooltip carries the full day. */
const shortDay = (ms: number): string => {
    const [, month, day] = kstDate(ms).split('-');
    return `${Number(month)}/${Number(day)}`;
};

/** Label every few columns once there are too many to label each. */
const labelEvery = (count: number): number => (count <= 14 ? 1 : Math.ceil(count / 10));

export const UsagePatterns = ({ nav }: UsagePatternsProps) => {
    const { t, lng } = useT('statsUsage');
    const { period } = nav;
    const base = { stage: nav.stage, from: period.fromDate, to: period.toDate };
    const unit = trendUnitOf(period);

    // Server counts. For a short period the per-time query and the hourly one are the same request.
    const people = useLogStats({ ...base, interval: unit, users: true });
    const opens = useLogStats({ ...base, tag: OPEN_TAG, interval: unit, users: true });
    const opensHourly = useLogStats({ ...base, tag: OPEN_TAG, interval: 'hour', users: true });
    // Usage events as rows, one fetch each, named so the hooks keep a fixed order.
    const ends = useStatRows(nav.stage, period, 'usage.session_end');
    const views = useStatRows(nav.stage, period, 'usage.screen_view');
    const starts = useStatRows(nav.stage, period, OPEN_TAG);

    const sessions = useMemo(() => summarizeSessions(ends.rows), [ends.rows]);
    const screens = useMemo(() => summarizeScreens(views.rows), [views.rows]);
    const startSummary = useMemo(() => summarizeStarts(starts.rows), [starts.rows]);
    const peopleTrend = useMemo(() => fillTrend(people.stats?.trend ?? [], unit, period), [people.stats, unit, period]);
    const opensTrend = useMemo(() => fillTrend(opens.stats?.trend ?? [], unit, period), [opens.stats, unit, period]);
    const hourSlots = useMemo(() => foldByHourOfDay(opensHourly.stats?.trend ?? []), [opensHourly.stats]);
    const busiest = busiestHour(hourSlots);

    const fmt = (value: number) => formatNumber(value, lng);
    const wider = widerPreset(period.preset);
    const widen = wider ? { label: t('common:empty.widen'), onClick: () => nav.setPeriod(wider) } : undefined;
    const loadingLine = <p className="text-sm text-muted-foreground">{t('common:fetch.loading')}</p>;
    const wideSpan = !period.exact && <Muted>{t('wideSpan', { from: period.fromDate, to: period.toDate })}</Muted>;
    const unsupported = (
        <Panel>
            <EmptyState title={t('unsupported.title')} hint={t('unsupported.hint')} />
        </Panel>
    );

    const serverError = people.error ?? opens.error ?? opensHourly.error;
    const rowsFailure = [ends, views, starts].find(set => set.corpus.phase === 'failed');
    const loading =
        people.isLoading || opens.isLoading || opensHourly.isLoading || ends.loading || views.loading || starts.loading;
    // One empty screen only once every answer is in and none has anything: a pending count is not a zero.
    const nothing =
        !loading &&
        !serverError &&
        !rowsFailure &&
        !people.total &&
        !opens.total &&
        ends.rows.length === 0 &&
        views.rows.length === 0 &&
        starts.rows.length === 0;

    if (nothing) {
        return (
            <Panel>
                <EmptyState title={t('empty.title')} hint={t('empty.hint')} action={widen} />
            </Panel>
        );
    }

    const openers = opens.stats?.users ?? 0;
    const opensTotal = opens.total ?? 0;
    const none = t('summary.none');

    const trendColumns = (trend: TrendBucket[], read: (bucket: TrendBucket) => number, titleKey: string) => {
        const every = labelEvery(trend.length);
        return trend.map<Column>((bucket, i) => {
            const hour = kstHourOf(bucket.key);
            const value = read(bucket);
            const label =
                unit === 'day'
                    ? i % every === 0
                        ? shortDay(bucket.key)
                        : undefined
                    : hour % (trend.length > 24 ? 6 : 3) === 0
                      ? t('trend.hourLabel', { h: hour })
                      : undefined;
            const when = unit === 'day' ? formatDay(bucket.key, lng) : formatDateTime(bucket.key, lng);
            return { key: bucket.key, label, value, title: t(titleKey, { when, n: fmt(value) }) };
        });
    };

    const hourColumns = hourSlots.map<Column>((value, hour) => ({
        key: hour,
        label: hour % 3 === 0 ? t('trend.hourLabel', { h: hour }) : undefined,
        value,
        title: t('hours.slotTitle', { h: hour, n: fmt(value) }),
        tone: hour === busiest ? 'primary' : 'muted',
    }));

    const screenShares = screens.screens.map<Share>(screen => ({
        key: screen.screen,
        label: <span className="font-mono text-[13px]">{screen.screen}</span>,
        value: screen.views,
        sub:
            screen.medianDwellMs === undefined
                ? t('screens.noDwell')
                : t('screens.sub', { dwell: formatDuration(screen.medianDwellMs, lng), n: fmt(screen.dwellCount) }),
    }));

    const countShares = (counts: Count[], known: string[], group: 'start' | 'entry') =>
        counts.map<Share>(({ key, count }) => ({
            key,
            label: known.includes(key) ? t(`starts.${group}.${key}`) : <span className="font-mono">{key}</span>,
            value: count,
        }));

    return (
        <>
            {serverError && <Failure message={t('failed', { message: serverError.message })} />}
            {rowsFailure && (
                <Failure message={t('common:fetch.failed', { message: rowsFailure.corpus.error?.message ?? '-' })} />
            )}

            <section className="flex flex-col gap-3">
                <SectionTitle title={t('summary.title')} hint={t('summary.hint')} />
                {people.isLoading || opens.isLoading || ends.loading ? (
                    loadingLine
                ) : (
                    <Panel className="flex flex-col gap-5 p-5">
                        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                            <Metric
                                size="lg"
                                label={t('summary.people')}
                                value={people.supported ? fmt(people.stats?.users ?? 0) : none}
                                sub={people.supported ? t('summary.peopleSub') : undefined}
                            />
                            <Metric size="lg" label={t('summary.opens')} value={opens.error ? none : fmt(opensTotal)} />
                            <Metric
                                size="lg"
                                label={t('summary.perPerson')}
                                value={
                                    opens.supported && openers > 0 ? formatNumber(opensTotal / openers, lng, 1) : none
                                }
                                sub={
                                    opens.supported && openers > 0
                                        ? t('summary.perPersonSub', { n: fmt(openers) })
                                        : undefined
                                }
                            />
                            <Metric
                                size="lg"
                                label={t('summary.sessionLength')}
                                value={
                                    sessions.medianDurationMs === undefined
                                        ? none
                                        : formatDuration(sessions.medianDurationMs, lng)
                                }
                                sub={
                                    sessions.sessions > 0
                                        ? t('summary.sessionsSub', { n: fmt(sessions.sessions) })
                                        : undefined
                                }
                            />
                            <Metric
                                size="lg"
                                label={t('summary.screens')}
                                value={
                                    sessions.medianScreens === undefined
                                        ? none
                                        : t('summary.screensValue', {
                                              n: formatNumber(sessions.medianScreens, lng, 1),
                                          })
                                }
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            {!people.supported && !people.error && <Muted>{t('unsupported.title')}</Muted>}
                            {wideSpan}
                            {ends.partial && <Muted>{t('summary.partial')}</Muted>}
                        </div>
                    </Panel>
                )}
            </section>

            <section className="flex flex-col gap-3">
                <SectionTitle title={t(unit === 'day' ? 'trend.titleDay' : 'trend.titleHour')} hint={t('trend.hint')} />
                {people.isLoading || opens.isLoading ? (
                    loadingLine
                ) : people.error ? null : !people.supported ? (
                    unsupported
                ) : !peopleTrend.some(bucket => bucket.val > 0) ? (
                    <Panel>
                        <EmptyState title={t('trend.empty')} action={widen} />
                    </Panel>
                ) : (
                    <Panel className="flex flex-col gap-5 p-5">
                        <div className="grid gap-8 lg:grid-cols-2">
                            <div className="flex flex-col gap-2">
                                <span className="text-[13px] font-medium text-muted-foreground">
                                    {t('trend.people')}
                                </span>
                                <ColumnChart
                                    label={t('trend.people')}
                                    format={fmt}
                                    columns={trendColumns(
                                        peopleTrend,
                                        bucket => bucket.users ?? 0,
                                        'trend.peopleTitle'
                                    )}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <span className="text-[13px] font-medium text-muted-foreground">
                                    {t('trend.opens')}
                                </span>
                                <ColumnChart
                                    label={t('trend.opens')}
                                    format={fmt}
                                    columns={trendColumns(opensTrend, bucket => bucket.val, 'trend.opensTitle')}
                                />
                            </div>
                        </div>
                        {wideSpan}
                    </Panel>
                )}
            </section>

            <section className="flex flex-col gap-3">
                <SectionTitle title={t('hours.title')} hint={t('hours.hint')} />
                {opensHourly.isLoading ? (
                    loadingLine
                ) : opensHourly.error ? null : !opensHourly.supported ? (
                    unsupported
                ) : busiest === undefined ? (
                    <Panel>
                        <EmptyState title={t('hours.empty')} action={widen} />
                    </Panel>
                ) : (
                    <Panel className="flex flex-col gap-4 p-5">
                        <p className="text-sm font-medium text-foreground">
                            {t('hours.busiest', { h: busiest, n: fmt(hourSlots[busiest]) })}
                        </p>
                        <ColumnChart label={t('hours.label')} format={fmt} columns={hourColumns} />
                        <div className="flex flex-col gap-1">
                            <Muted>{t('hours.note')}</Muted>
                            {wideSpan}
                        </div>
                    </Panel>
                )}
            </section>

            <section className="flex flex-col gap-3">
                <SectionTitle title={t('screens.title')} hint={t('screens.hint')} />
                {views.loading ? (
                    loadingLine
                ) : screens.totalViews === 0 ? (
                    <Panel>
                        <EmptyState title={t('screens.empty')} action={widen} />
                    </Panel>
                ) : (
                    <Panel className="flex flex-col gap-4 p-5">
                        <ShareBars
                            label={t('screens.label')}
                            shares={screenShares}
                            total={screens.totalViews}
                            format={fmt}
                        />
                        <div className="flex flex-col gap-1 border-t border-border pt-3">
                            <Muted>
                                {t('screens.total', { distinct: fmt(screens.distinct), n: fmt(screens.totalViews) })}
                            </Muted>
                            {views.partial && <Muted>{t('partial')}</Muted>}
                        </div>
                    </Panel>
                )}
            </section>

            <section className="flex flex-col gap-3">
                <SectionTitle title={t('starts.title')} hint={t('starts.hint')} />
                {starts.loading ? (
                    loadingLine
                ) : startSummary.sessions === 0 ? (
                    <Panel>
                        <EmptyState title={t('starts.empty')} action={widen} />
                    </Panel>
                ) : (
                    <Panel className="flex flex-col gap-5 p-5">
                        <div className="grid gap-8 sm:grid-cols-2">
                            <div className="flex flex-col gap-3">
                                <span className="text-[13px] font-medium text-muted-foreground">
                                    {t('starts.startLabel')}
                                </span>
                                <ShareBars
                                    label={t('starts.startLabel')}
                                    shares={countShares(startSummary.start, START_KINDS, 'start')}
                                    format={fmt}
                                />
                            </div>
                            <div className="flex flex-col gap-3">
                                <span className="text-[13px] font-medium text-muted-foreground">
                                    {t('starts.entryLabel')}
                                </span>
                                <ShareBars
                                    label={t('starts.entryLabel')}
                                    shares={countShares(startSummary.entry, ENTRY_KINDS, 'entry')}
                                    format={fmt}
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-1 border-t border-border pt-3">
                            <Muted>{t('starts.total', { n: fmt(startSummary.sessions) })}</Muted>
                            {starts.partial && <Muted>{t('partial')}</Muted>}
                        </div>
                    </Panel>
                )}
            </section>
        </>
    );
};
