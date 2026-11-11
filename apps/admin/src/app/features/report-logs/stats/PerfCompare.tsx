/**
 * `stats/PerfCompare.tsx`
 * - "Did the new version get slower, and for whom?" — one goal at a time, split by app version, OS,
 *   device or platform, with its daily trend, its distribution and the slowest cases.
 *
 * The goal and the split are URL parameters (`goal`, `by`), so a link to "room entry by device"
 * opens on exactly that. Every number is computed from the goal's own records in the window, by
 * occurrence time, at the goal's own percentile — the same reading the overview card makes, so the
 * two never disagree. Goal records are kept from every run, so the counts are real, not estimates.
 *
 * Each slow case leads to that user's timeline at that moment, which is where "why was it slow"
 * gets answered.
 */
import { useMemo } from 'react';

import { useT } from '../../../i18n';
import { ColumnChart, Histogram, tableClass } from '../components/console/charts';
import { EmptyState } from '../components/console/EmptyState';
import { Stamp } from '../components/console/Stamp';
import {
    ChoiceRow,
    Metric,
    Panel,
    Pill,
    quietButton,
    SectionTitle,
    type MetricTone,
    type PillTone,
} from '../components/console/ui';
import type { ConsoleNav } from '../hooks/use-console-nav';
import { useStatRows, type StatRows } from '../hooks/use-stat-rows';
import { GOALS, readGoal, type GoalKey, type GoalReading } from '../lib/goals';
import { formatOs, type ReportLogRow } from '../lib/parseReportLog';
import {
    compareBy,
    dailyReadings,
    distribution,
    goalSamples,
    MIN_TO_JUDGE,
    NO_VALUE,
    PERF_SPLITS,
    slowestSamples,
    type PerfSplit,
    type SplitGroup,
} from '../lib/perfCompare';
import { widerPreset } from '../lib/period';
import { formatDay, formatDuration, formatNumber } from '../lib/timeFormat';

interface PerfCompareProps {
    nav: ConsoleNav;
}

const VERDICT_TONE: Record<GoalReading['verdict'], { pill: PillTone; metric: MetricTone }> = {
    met: { pill: 'good', metric: 'good' },
    missed: { pill: 'error', metric: 'error' },
    none: { pill: 'neutral', metric: 'plain' },
    noData: { pill: 'neutral', metric: 'plain' },
};

const KNOWN_PLATFORMS = ['ios', 'android', 'web'];

export const PerfCompare = ({ nav }: PerfCompareProps) => {
    const { t, lng } = useT('statsPerf');
    const { period } = nav;

    const goal = GOALS.find(g => g.key === nav.param('goal')) ?? GOALS[0];
    const rawBy = nav.param('by');
    const by: PerfSplit = (PERF_SPLITS as readonly string[]).includes(rawBy) ? (rawBy as PerfSplit) : 'appVersion';

    // One fetch per statistic, named so the hooks keep a fixed order. All five run whatever the goal:
    // they share the overview's cache, and switching the goal then shows its numbers at once.
    const boot = useStatRows(nav.stage, period, 'perf.boot');
    const room = useStatRows(nav.stage, period, 'perf.chat_room_open');
    const cloudSwitch = useStatRows(nav.stage, period, 'perf.cloud_switch');
    const siteSwitch = useStatRows(nav.stage, period, 'perf.site_switch');
    const vitals = useStatRows(nav.stage, period, 'perf.web_vitals');
    const byTag: Record<string, StatRows> = {
        'perf.boot': boot,
        'perf.chat_room_open': room,
        'perf.cloud_switch': cloudSwitch,
        'perf.site_switch': siteSwitch,
        'perf.web_vitals': vitals,
    };
    const used = goal.tags.map(tag => byTag[tag]).filter((source): source is StatRows => !!source);

    const rows = useMemo<ReportLogRow[]>(() => {
        const rowsByTag: Record<string, ReportLogRow[]> = {
            'perf.boot': boot.rows,
            'perf.chat_room_open': room.rows,
            'perf.cloud_switch': cloudSwitch.rows,
            'perf.site_switch': siteSwitch.rows,
            'perf.web_vitals': vitals.rows,
        };
        return goal.tags.flatMap(tag => rowsByTag[tag] ?? []);
    }, [goal, boot.rows, room.rows, cloudSwitch.rows, siteSwitch.rows, vitals.rows]);
    const samples = useMemo(() => goalSamples(goal, rows, period), [goal, rows, period]);
    const reading = useMemo(() => readGoal(goal, rows, period), [goal, rows, period]);
    const groups = useMemo(() => compareBy(samples, goal, by), [samples, goal, by]);
    const days = useMemo(() => dailyReadings(samples, goal), [samples, goal]);
    const spread = useMemo(() => distribution(samples), [samples]);
    const slowest = useMemo(() => slowestSamples(samples), [samples]);

    const loading = used.some(source => source.loading);
    const failed = used.find(source => source.corpus.phase === 'failed');
    const partial = used.some(source => source.partial);

    const goalName = t(`stats:goal.${goal.key}.name`);
    const target = goal.targetMs === undefined ? undefined : formatDuration(goal.targetMs, lng);
    const ms = (value?: number) => (value === undefined ? '—' : formatDuration(value, lng));
    const wider = widerPreset(period.preset);

    const groupLabel = (group: string): string => {
        if (group === NO_VALUE) return t('none');
        if (by === 'appVersion') return t('common:device.app', { version: group });
        if (by === 'platform' && KNOWN_PLATFORMS.includes(group)) return t(`platform.${group}`);
        return group;
    };

    const versionOf = (row: ReportLogRow): string | undefined =>
        row.appVersion
            ? t('common:device.app', { version: row.appVersion })
            : row.webVersion
              ? t('common:device.web', { version: row.webVersion })
              : undefined;

    const pickers = (
        <Panel className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="w-20 shrink-0 text-[13px] font-medium text-muted-foreground">{t('pick.goal')}</span>
                <ChoiceRow<GoalKey>
                    label={t('pick.goal')}
                    value={goal.key}
                    options={GOALS.map(g => ({ value: g.key, label: t(`stats:goal.${g.key}.name`) }))}
                    onChange={next => nav.patch({ goal: next === 'boot' ? '' : next })}
                />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-4">
                <span className="w-20 shrink-0 text-[13px] font-medium text-muted-foreground">{t('pick.by')}</span>
                <ChoiceRow<PerfSplit>
                    label={t('pick.by')}
                    value={by}
                    options={PERF_SPLITS.map(value => ({ value, label: t(`by.${value}`) }))}
                    onChange={next => nav.patch({ by: next === 'appVersion' ? '' : next })}
                />
            </div>
        </Panel>
    );

    if (loading || failed || samples.length === 0) {
        return (
            <>
                {pickers}
                {failed ? (
                    <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        {t('common:fetch.failed', { message: failed.corpus.error?.message ?? '-' })}
                    </p>
                ) : loading ? (
                    <p className="text-sm text-muted-foreground">{t('common:fetch.loading')}</p>
                ) : (
                    <Panel>
                        <EmptyState
                            title={t('empty.title', { goal: goalName })}
                            hint={t('empty.hint')}
                            action={
                                wider
                                    ? { label: t('common:empty.widen'), onClick: () => nav.setPeriod(wider) }
                                    : undefined
                            }
                        />
                    </Panel>
                )}
            </>
        );
    }

    const partialNote = partial && <p className="text-[13px] text-muted-foreground">{t('partial')}</p>;
    const percentileHeads: Array<{ key: 'p50' | 'p75' | 'p95'; at: number }> = [
        { key: 'p50', at: 50 },
        { key: 'p75', at: 75 },
        { key: 'p95', at: 95 },
    ];

    return (
        <>
            {pickers}

            <section className="flex flex-col gap-3">
                <SectionTitle
                    title={goalName}
                    hint={t(`stats:goal.${goal.key}.what`)}
                    action={
                        <Pill tone={VERDICT_TONE[reading.verdict].pill}>{t(`stats:verdict.${reading.verdict}`)}</Pill>
                    }
                />
                <Panel className="flex flex-col gap-4 p-5">
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        <Metric
                            size="lg"
                            label={t('summary.atP', { p: goal.p })}
                            value={ms(reading.value)}
                            tone={VERDICT_TONE[reading.verdict].metric}
                            sub={target ? t('summary.target', { target }) : t('summary.noTarget')}
                        />
                        <Metric
                            size="lg"
                            label={t('summary.median')}
                            value={ms(reading.median)}
                            sub={t('summary.medianSub')}
                        />
                        <Metric
                            size="lg"
                            label={t('summary.count')}
                            value={formatNumber(reading.n, lng)}
                            sub={t('summary.countSub')}
                        />
                    </div>
                    {partialNote}
                </Panel>
            </section>

            <section className="flex flex-col gap-3">
                <SectionTitle
                    title={t('compare.title', { by: t(`by.${by}`) })}
                    hint={t('compare.hint', { n: MIN_TO_JUDGE })}
                />
                <Panel className="flex flex-col gap-3 p-5">
                    <div className="-mx-5 overflow-x-auto">
                        <table className={tableClass.table}>
                            <thead className={tableClass.head}>
                                <tr>
                                    <th className={tableClass.th}>{t(`by.${by}`)}</th>
                                    <th className={tableClass.thNum}>{t('compare.n')}</th>
                                    {percentileHeads.map(head => (
                                        <th
                                            key={head.key}
                                            className={`${tableClass.thNum} ${head.at === goal.p ? 'text-foreground' : ''}`}
                                            title={t(`compare.${head.key}Tip`)}
                                        >
                                            <abbr className="cursor-help no-underline">{t(`compare.${head.key}`)}</abbr>
                                        </th>
                                    ))}
                                    {target && (
                                        <th
                                            className={tableClass.th}
                                            title={t('compare.verdictTip', { p: goal.p, target })}
                                        >
                                            {t('compare.verdict')}
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {groups.map(group => (
                                    <CompareRow
                                        key={group.group}
                                        group={group}
                                        label={groupLabel(group.group)}
                                        goalP={goal.p}
                                        hasTarget={!!target}
                                        format={ms}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {!target && <p className="text-[13px] text-muted-foreground">{t('compare.noTarget')}</p>}
                    {partialNote}
                </Panel>
            </section>

            <section className="flex flex-col gap-3">
                <SectionTitle
                    title={t('trend.title')}
                    hint={target ? t('trend.hint', { p: goal.p }) : t('trend.hintNoTarget', { p: goal.p })}
                />
                <Panel className="flex flex-col gap-3 p-5">
                    <ColumnChart
                        label={t('trend.label', { p: goal.p })}
                        format={value => formatDuration(value, lng)}
                        columns={days.map(day => ({
                            key: day.day,
                            label: formatDay(day.dayStart, lng),
                            value: day.value,
                            tone: day.over ? 'error' : day.tooFew ? 'muted' : 'primary',
                            title: t('trend.column', {
                                day: formatDay(day.dayStart, lng),
                                value: formatDuration(day.value, lng),
                                n: formatNumber(day.n, lng),
                            }),
                        }))}
                    />
                    {partialNote}
                </Panel>
            </section>

            <section className="flex flex-col gap-3">
                <SectionTitle
                    title={t('spread.title')}
                    // The line is drawn only where the target falls inside the drawn range; when every
                    // measurement is well under it, saying "the line is the target" would point at nothing.
                    hint={
                        target &&
                        goal.targetMs !== undefined &&
                        spread.bins.length > 0 &&
                        goal.targetMs >= spread.bins[0].from &&
                        goal.targetMs <= spread.bins[spread.bins.length - 1].to
                            ? t('spread.hint')
                            : t('spread.hintNoTarget')
                    }
                />
                <Panel className="flex flex-col gap-3 p-5">
                    <Histogram
                        bins={spread.bins}
                        label={t('spread.label')}
                        format={value => formatDuration(value, lng)}
                        marker={
                            goal.targetMs !== undefined && target
                                ? { value: goal.targetMs, label: t('spread.marker', { target }) }
                                : undefined
                        }
                    />
                    {spread.clipped > 0 && (
                        <p className="text-[13px] text-muted-foreground">
                            {t('spread.clipped', { n: formatNumber(spread.clipped, lng), max: ms(spread.max) })}
                        </p>
                    )}
                </Panel>
            </section>

            <section className="flex flex-col gap-3">
                <SectionTitle title={t('slowest.title')} hint={t('slowest.hint')} />
                <Panel className="flex flex-col gap-3 p-5">
                    <div className="-mx-5 overflow-x-auto">
                        <table className={tableClass.table}>
                            <thead className={tableClass.head}>
                                <tr>
                                    <th className={tableClass.th}>{t('slowest.time')}</th>
                                    <th className={tableClass.thNum}>{t('slowest.value')}</th>
                                    <th className={tableClass.th}>{t('slowest.device')}</th>
                                    <th className={tableClass.th}>{t('slowest.user')}</th>
                                    <th className={tableClass.th}>
                                        <span className="sr-only">{t('slowest.open')}</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {slowest.map(({ row, at, value }) => {
                                    const over = goal.targetMs !== undefined && value > goal.targetMs;
                                    const device = [row.model, formatOs(row.os, row.osVersion), versionOf(row)]
                                        .filter(Boolean)
                                        .join(' · ');
                                    return (
                                        <tr key={row.id} className={tableClass.row}>
                                            <td className={`${tableClass.td} text-[13px]`}>
                                                <Stamp ms={at} />
                                            </td>
                                            <td
                                                className={`${tableClass.tdNum} font-medium ${over ? 'text-red-600 dark:text-red-400' : ''}`}
                                            >
                                                {formatDuration(value, lng)}
                                            </td>
                                            <td className={`${tableClass.td} text-[13px] text-muted-foreground`}>
                                                {device || t('none')}
                                            </td>
                                            <td className={tableClass.td}>
                                                {row.userId
                                                    ? t('common:user.anonymous', { id: row.userId })
                                                    : t('common:user.unknown')}
                                            </td>
                                            <td className={`${tableClass.td} text-right`}>
                                                <button
                                                    type="button"
                                                    className={`${quietButton} disabled:cursor-not-allowed disabled:opacity-50`}
                                                    disabled={!row.userId}
                                                    onClick={() =>
                                                        row.userId &&
                                                        nav.go('user', { uid: row.userId, at: String(at) })
                                                    }
                                                >
                                                    {t('slowest.open')}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {partialNote}
                </Panel>
            </section>
        </>
    );
};

const CompareRow = ({
    group,
    label,
    goalP,
    hasTarget,
    format,
}: {
    group: SplitGroup;
    label: string;
    goalP: number;
    hasTarget: boolean;
    format: (value?: number) => string;
}) => {
    const { t, lng } = useT('statsPerf');
    const emphasis = (at: number) => (at === goalP ? 'font-semibold' : '');
    return (
        <tr className={`${tableClass.row} ${group.newest ? 'bg-primary/5' : ''} ${group.tooFew ? 'opacity-60' : ''}`}>
            <td className={tableClass.td}>
                <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{label}</span>
                    {group.newest && <Pill tone="neutral">{t('compare.newest')}</Pill>}
                </span>
            </td>
            <td className={tableClass.tdNum}>{formatNumber(group.n, lng)}</td>
            <td className={`${tableClass.tdNum} ${emphasis(50)}`}>{format(group.p50)}</td>
            <td className={`${tableClass.tdNum} ${emphasis(75)}`}>{format(group.p75)}</td>
            <td className={`${tableClass.tdNum} ${emphasis(95)}`}>{format(group.p95)}</td>
            {hasTarget && (
                <td className={tableClass.td}>
                    {group.tooFew ? (
                        <span className="text-[13px] text-muted-foreground">{t('compare.tooFew')}</span>
                    ) : group.verdict === 'none' ? (
                        '—'
                    ) : (
                        <Pill tone={group.verdict === 'met' ? 'good' : 'error'}>
                            {t(`stats:verdict.${group.verdict}`)}
                        </Pill>
                    )}
                </td>
            )}
        </tr>
    );
};
