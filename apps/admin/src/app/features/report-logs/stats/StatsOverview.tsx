/**
 * `stats/StatsOverview.tsx`
 * - The statistics tab's first view: "are we fast enough, and how many people use it?" at a glance.
 *
 * Each goal card reads one measurement against its target at the percentile the target is defined
 * at. The records come from a fetch narrowed on the server to that statistic's tag, so a card is
 * not starved by the logs that outnumber statistics in an unfiltered page. Usage comes from the
 * server's aggregation — distinct users and app opens over the period, per day — so it counts past
 * the page as well, over whole days (and the tab says so for a period narrower than its days).
 *
 * When there are no statistics at all the tab says why and when there will be, instead of a row of
 * empty cards that read as "zero".
 */
import { useMemo } from 'react';

import { useT } from '../../../i18n';
import { EmptyState } from '../components/console/EmptyState';
import { Metric, Panel, Pill, SectionTitle, type PillTone } from '../components/console/ui';
import type { ConsoleNav } from '../hooks/use-console-nav';
import { useLogCorpus, type LogCorpus } from '../hooks/use-log-corpus';
import { useLogStats } from '../hooks/use-log-stats';
import { GOALS, readGoal, type GoalDef, type GoalReading } from '../lib/goals';
import type { ReportLogRow } from '../lib/parseReportLog';
import { formatDay, formatDuration, formatNumber } from '../lib/timeFormat';

interface StatsOverviewProps {
    nav: ConsoleNav;
}

const VERDICT_TONE: Record<GoalReading['verdict'], PillTone> = {
    met: 'good',
    missed: 'error',
    none: 'neutral',
    noData: 'neutral',
};

/**
 * The value against its target as a bar: the track spans half again the target, so "within" sits
 * left of the marker and "over" runs past it.
 */
const TargetBar = ({ value, target }: { value: number; target: number }) => {
    const span = Math.max(target * 1.5, value);
    const fill = Math.min(100, (value / span) * 100);
    const marker = (target / span) * 100;
    return (
        <div className="relative h-2 w-full rounded-full bg-muted" aria-hidden>
            <div
                className={`absolute inset-y-0 left-0 rounded-full ${value <= target ? 'bg-emerald-500' : 'bg-red-500'}`}
                style={{ width: `${fill}%` }}
            />
            <div className="absolute -inset-y-1 w-0.5 rounded bg-foreground/60" style={{ left: `${marker}%` }} />
        </div>
    );
};

const GoalCard = ({ goal, reading, partial }: { goal: GoalDef; reading: GoalReading; partial: boolean }) => {
    const { t, lng } = useT('stats');
    return (
        <li>
            <Panel className="flex h-full flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                        <h3 className="text-[15px] font-semibold text-foreground">{t(`goal.${goal.key}.name`)}</h3>
                        <p className="text-[13px] leading-snug text-muted-foreground">{t(`goal.${goal.key}.what`)}</p>
                    </div>
                    <Pill tone={VERDICT_TONE[reading.verdict]}>{t(`verdict.${reading.verdict}`)}</Pill>
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-3xl font-semibold tabular-nums text-foreground">
                        {reading.value === undefined ? '—' : formatDuration(reading.value, lng)}
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                        {goal.targetMs === undefined
                            ? t('card.atNoTarget', { p: goal.p })
                            : t('card.atTarget', { p: goal.p, target: formatDuration(goal.targetMs, lng) })}
                    </span>
                </div>
                {reading.value !== undefined && goal.targetMs !== undefined && (
                    <TargetBar value={reading.value} target={goal.targetMs} />
                )}
                <p className="mt-auto text-xs text-muted-foreground">
                    {reading.n > 0
                        ? t('card.sample', {
                              n: formatNumber(reading.n, lng),
                              median: reading.median === undefined ? '—' : formatDuration(reading.median, lng),
                          })
                        : t('card.noData')}
                    {partial && reading.n > 0 && ` · ${t('card.partial')}`}
                </p>
            </Panel>
        </li>
    );
};

export const StatsOverview = ({ nav }: StatsOverviewProps) => {
    const { t, lng } = useT('stats');
    const { period } = nav;
    const base = { stage: nav.stage, from: period.fromDate, to: period.toDate };

    // One fetch per statistic, named rather than looped so the hooks keep a fixed order.
    const boot = useLogCorpus({ ...base, tag: 'perf.boot' });
    const room = useLogCorpus({ ...base, tag: 'perf.chat_room_open' });
    const cloudSwitch = useLogCorpus({ ...base, tag: 'perf.cloud_switch' });
    const siteSwitch = useLogCorpus({ ...base, tag: 'perf.site_switch' });
    const vitals = useLogCorpus({ ...base, tag: 'perf.web_vitals' });
    const corpora: LogCorpus[] = [boot, room, cloudSwitch, siteSwitch, vitals];

    const usage = useLogStats({ ...base, interval: 'day', users: true });
    const sessions = useLogStats({ ...base, tag: 'usage.session_start', users: true });

    const rows = useMemo<ReportLogRow[]>(
        () => [boot.rows, room.rows, cloudSwitch.rows, siteSwitch.rows, vitals.rows].flat(),
        [boot.rows, room.rows, cloudSwitch.rows, siteSwitch.rows, vitals.rows]
    );
    const readings = useMemo(
        () => GOALS.map(goal => ({ goal, reading: readGoal(goal, rows, period) })),
        [rows, period]
    );

    const loading = corpora.some(corpus => corpus.phase === 'collecting' && corpus.loaded === 0) || sessions.isLoading;
    const failed = corpora.find(corpus => corpus.phase === 'failed');
    const partial = corpora.some(corpus => corpus.isTruncated);
    // "No statistics" only once every answer is in: a still-loading count is not a zero.
    const noStatistics =
        !loading && !failed && !sessions.error && readings.every(({ reading }) => reading.n === 0) && !sessions.total;

    const trend = usage.stats?.trend ?? [];
    const maxUsers = Math.max(1, ...trend.map(bucket => bucket.users ?? 0));

    return (
        <>
            {failed && (
                <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {t('common:fetch.failed', { message: failed.error?.message ?? '-' })}
                </p>
            )}
            <section className="flex flex-col gap-3">
                <SectionTitle title={t('goals.title')} hint={t('goals.hint')} />
                {loading ? (
                    <p className="text-sm text-muted-foreground">{t('common:fetch.loading')}</p>
                ) : noStatistics ? (
                    <Panel className="flex flex-col gap-3 p-6">
                        <h3 className="text-[15px] font-semibold text-foreground">{t('off.title')}</h3>
                        <p className="text-sm leading-relaxed text-muted-foreground">{t('off.why')}</p>
                        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                            <li>{t('off.where')}</li>
                            <li>{t('off.rates')}</li>
                            <li>{t('off.firstRun')}</li>
                        </ul>
                    </Panel>
                ) : (
                    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {readings.map(({ goal, reading }) => (
                            <GoalCard key={goal.key} goal={goal} reading={reading} partial={partial} />
                        ))}
                    </ul>
                )}
            </section>
            <section className="flex flex-col gap-3">
                <SectionTitle title={t('usage.title')} />
                {usage.isLoading ? (
                    <p className="text-sm text-muted-foreground">{t('common:fetch.loading')}</p>
                ) : usage.error ? (
                    <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        {t('usage.failed', { message: usage.error.message })}
                    </p>
                ) : !usage.supported ? (
                    <Panel>
                        <EmptyState title={t('usage.unsupported')} hint={t('usage.unsupportedHint')} />
                    </Panel>
                ) : (
                    <Panel className="flex flex-col gap-6 p-5">
                        <div className="flex flex-wrap gap-x-10 gap-y-4">
                            <Metric
                                size="lg"
                                label={t('usage.users')}
                                value={formatNumber(usage.stats?.users ?? 0, lng)}
                            />
                            <Metric size="lg" label={t('usage.opens')} value={formatNumber(sessions.total ?? 0, lng)} />
                            <Metric size="lg" label={t('usage.records')} value={formatNumber(usage.total ?? 0, lng)} />
                        </div>
                        {trend.length > 0 && (
                            <div className="flex flex-col gap-2">
                                <span className="text-[13px] font-medium text-muted-foreground">
                                    {t('usage.daily')}
                                </span>
                                <div className="flex h-28 items-end gap-2" role="img" aria-label={t('usage.daily')}>
                                    {trend.map(bucket => (
                                        <div
                                            key={bucket.key}
                                            className="flex h-full max-w-16 flex-1 flex-col items-center justify-end gap-1"
                                        >
                                            <span className="text-xs tabular-nums text-muted-foreground">
                                                {formatNumber(bucket.users ?? 0, lng)}
                                            </span>
                                            <div
                                                className="w-full rounded-t bg-primary/70"
                                                style={{
                                                    height: `${Math.max(3, ((bucket.users ?? 0) / maxUsers) * 100)}%`,
                                                }}
                                                title={`${formatDay(bucket.key, lng)} · ${t('usage.usersOn', { count: bucket.users ?? 0 })}`}
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    {trend.map(bucket => (
                                        <span
                                            key={bucket.key}
                                            className="max-w-16 flex-1 truncate text-center text-[11px] text-muted-foreground"
                                        >
                                            {formatDay(bucket.key, lng)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        <p className="text-[13px] leading-relaxed text-muted-foreground">
                            {!period.exact && `${t('usage.wideSpan', { from: period.fromDate, to: period.toDate })} `}
                            {t('usage.note')}
                        </p>
                    </Panel>
                )}
            </section>
        </>
    );
};
