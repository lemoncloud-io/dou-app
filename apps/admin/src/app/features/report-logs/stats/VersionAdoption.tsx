/**
 * `stats/VersionAdoption.tsx`
 * - The statistics tab's version view: "which versions and devices are people on, and how many of
 *   them can send statistics?"
 *
 * Every number here is the server's, over all records — logs included. Every app version sends
 * logs, while statistics exist only from 0.29.2, so counting statistics alone would hide exactly
 * the people still on an older version. The server counts records per value (`groupBy`) but not
 * people per value, so the view asks once per value for distinct users, for the few values with
 * the most records. A person who updated during the period is counted under both versions; the
 * copy says so wherever that makes a sum run high.
 *
 * Records without the field being split on (the browser web has no app version) fall in no row,
 * and the shares are of all users, so the rows need not add up to the total.
 */
import { useT } from '../../../i18n';
import { ShareBars, tableClass, type Share } from '../components/console/charts';
import { EmptyState } from '../components/console/EmptyState';
import { ChoiceRow, Metric, Panel, Pill, SectionTitle } from '../components/console/ui';
import type { ConsoleNav } from '../hooks/use-console-nav';
import { useLogStats, type LogStatsResult } from '../hooks/use-log-stats';
import { useLogStatsMany } from '../hooks/use-log-stats-many';
import { kstDayStart, widerPreset } from '../lib/period';
import { formatDay, formatNumber } from '../lib/timeFormat';
import {
    adoptionByDay,
    canSendStats,
    firstSeenDay,
    namedBuckets,
    newestVersion,
    statsCoverage,
    valuesToAsk,
} from '../lib/versionAdoption';

export const VERSION_DIMS = ['appVersion', 'os', 'model', 'webVersion'] as const;

export type VersionDim = (typeof VERSION_DIMS)[number];

/** How many values the server ranks per field; the view asks users for the top few of them. */
const GROUP_SIZE = 10;

/** The server's ceiling on values per `groupBy` field. */
const ALL_VERSIONS = 100;

/** Versions shown side by side in the day-by-day table. */
const ADOPTION_COLUMNS = 3;

const formatShare = (share: number): string =>
    share > 0 && share < 0.01 ? '<1%' : `${Math.round(Math.min(1, share) * 100)}%`;

const Loading = () => {
    const { t } = useT('statsVersions');
    return <p className="text-sm text-muted-foreground">{t('common:fetch.loading')}</p>;
};

const Failed = ({ error }: { error: Error }) => {
    const { t } = useT('statsVersions');
    return (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {t('common:fetch.failed', { message: error.message })}
        </p>
    );
};

const firstError = (results: LogStatsResult[]): Error | undefined =>
    results.find(result => result.error)?.error ?? undefined;

export const VersionAdoption = ({ nav }: { nav: ConsoleNav }) => {
    const { t, lng } = useT('statsVersions');
    const { period } = nav;
    const raw = nav.param('dim');
    const dim: VersionDim = (VERSION_DIMS as readonly string[]).includes(raw) ? (raw as VersionDim) : 'appVersion';
    const base = { stage: nav.stage, from: period.fromDate, to: period.toDate };

    // Everyone in the period, and per day — the same query the overview's usage asks, so it is shared.
    const total = useLogStats({ ...base, interval: 'day', users: true });
    // Records per app version always (coverage, the newest version), per the chosen field as well;
    // with the app version chosen the two are one query.
    // Every version the server will count (its maximum), not the busiest few: a release in its first
    // hours has few records and would otherwise never be found as the newest.
    const versionGroups = useLogStats({ ...base, groupBy: ['appVersion'], aggrSize: ALL_VERSIONS });
    const dimGroups = useLogStats({ ...base, groupBy: [dim], aggrSize: GROUP_SIZE });

    const versionBuckets = namedBuckets(versionGroups.stats?.groups?.appVersion);
    const dimBuckets = namedBuckets(dimGroups.stats?.groups?.[dim]);
    const versionsAsked = valuesToAsk(versionBuckets, true);
    const dimAsked = dim === 'appVersion' ? versionsAsked : valuesToAsk(dimBuckets, false);

    // Distinct users per value, with the daily split. Both lists use the same shape, so with the
    // app version chosen they are the same queries and are fetched once.
    const versionUsers = useLogStatsMany(
        versionsAsked.map(appVersion => ({ ...base, appVersion, interval: 'day' as const, users: true }))
    );
    const dimUsers = useLogStatsMany(
        dimAsked.map(value => ({ ...base, [dim]: value, interval: 'day' as const, users: true }))
    );

    const perVersion = versionsAsked.map((version, i) => ({
        version,
        users: versionUsers[i]?.stats?.users ?? 0,
        trend: versionUsers[i]?.stats?.trend,
    }));

    const totalUsers = total.stats?.users ?? 0;
    const unsupported = !total.isLoading && !total.error && !total.supported;
    const empty = !total.isLoading && !total.error && total.supported && !total.total;
    const wider = widerPreset(period.preset);
    const dimInline = t(`dimInline.${dim}`);

    if (total.isLoading) return <Loading />;
    if (total.error) return <Failed error={total.error} />;
    if (unsupported || empty) {
        return (
            <section className="flex flex-col gap-3">
                <SectionTitle title={t('summary.title')} />
                <Panel>
                    {unsupported ? (
                        <EmptyState title={t('unsupported')} hint={t('unsupportedHint')} />
                    ) : (
                        <EmptyState
                            title={t('common:empty.noRecords')}
                            action={
                                wider
                                    ? { label: t('common:empty.widen'), onClick: () => nav.setPeriod(wider) }
                                    : undefined
                            }
                        />
                    )}
                </Panel>
            </section>
        );
    }

    // --- At a glance: everyone, statistics coverage, the newest version.
    const versionsLoading = versionGroups.isLoading || versionUsers.some(result => result.isLoading);
    const versionsError = versionGroups.error ?? firstError(versionUsers);
    const coverage = statsCoverage(perVersion);
    const newest = newestVersion(versionBuckets.map(bucket => bucket.key));
    const newestEntry = perVersion.find(item => item.version === newest);
    const newestSeen = firstSeenDay(newestEntry?.trend);
    const fromStart = newestSeen !== undefined && newestSeen <= kstDayStart(period.fromDate);

    // --- People per value of the chosen field.
    const dimLoading = dimGroups.isLoading || dimUsers.some(result => result.isLoading);
    const dimError = dimGroups.error ?? firstError(dimUsers);
    const recordsOf = new Map(dimBuckets.map(bucket => [bucket.key, bucket.val]));
    const shares: Share[] = dimAsked
        .map((value, i) => ({ value, users: dimUsers[i]?.stats?.users ?? 0 }))
        .sort((a, b) => b.users - a.users)
        .map(({ value, users }) => ({
            key: value,
            value: users,
            label:
                dim === 'appVersion' && canSendStats(value) ? (
                    <span className="inline-flex items-center gap-2">
                        {value}
                        <Pill title={t('people.sendsStatsHelp')}>{t('people.sendsStats')}</Pill>
                    </span>
                ) : (
                    value
                ),
            sub: t('people.records', { n: formatNumber(recordsOf.get(value) ?? 0, lng) }),
        }));
    // Approximate counts can put one value a little above the total; never draw a bar past full.
    const shareBase = Math.max(totalUsers, ...shares.map(share => share.value));

    // --- Adoption by day, app versions only.
    const columns = [...perVersion]
        .sort((a, b) => b.users - a.users)
        .slice(0, ADOPTION_COLUMNS)
        .map(item => item.version);
    const days = adoptionByDay(perVersion, columns);

    return (
        <>
            <section className="flex flex-col gap-3">
                <SectionTitle title={t('summary.title')} hint={t('summary.hint')} />
                <Panel className="flex flex-col gap-5 p-5">
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        <Metric
                            size="lg"
                            label={t('summary.users')}
                            value={formatNumber(totalUsers, lng)}
                            sub={t('summary.usersSub', { n: formatNumber(total.total ?? 0, lng) })}
                        />
                        {versionsLoading ? (
                            <Loading />
                        ) : versionsError ? (
                            <Failed error={versionsError} />
                        ) : coverage ? (
                            <>
                                <Metric
                                    size="lg"
                                    label={t('summary.coverage')}
                                    value={formatShare(coverage.share)}
                                    sub={t('summary.coverageSub', {
                                        eligible: formatNumber(coverage.eligible, lng),
                                        total: formatNumber(coverage.total, lng),
                                    })}
                                />
                                {newest && (
                                    <Metric
                                        size="lg"
                                        label={t('summary.newest')}
                                        value={newest}
                                        sub={[
                                            t('summary.newestUsers', {
                                                n: formatNumber(newestEntry?.users ?? 0, lng),
                                            }),
                                            newestSeen === undefined
                                                ? undefined
                                                : fromStart
                                                  ? t('summary.newestFromStart')
                                                  : t('summary.newestSince', { day: formatDay(newestSeen, lng) }),
                                        ]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    />
                                )}
                            </>
                        ) : (
                            <p className="text-sm text-muted-foreground sm:col-span-2">{t('summary.noVersions')}</p>
                        )}
                    </div>
                    <div className="flex flex-col gap-1 border-t border-border pt-4 text-[13px] leading-relaxed text-muted-foreground">
                        <p>{t('summary.coverageHelp')}</p>
                        {!period.exact && <p>{t('wideSpan', { from: period.fromDate, to: period.toDate })}</p>}
                    </div>
                </Panel>
            </section>

            <section className="flex flex-col gap-3">
                <SectionTitle
                    title={t('people.title', { dim: dimInline })}
                    hint={t('people.hint')}
                    action={
                        <ChoiceRow
                            label={t('dim.label')}
                            value={dim}
                            options={VERSION_DIMS.map(value => ({ value, label: t(`dim.${value}`) }))}
                            onChange={next => nav.patch({ dim: next === 'appVersion' ? '' : next })}
                        />
                    }
                />
                {dimLoading ? (
                    <Loading />
                ) : dimError ? (
                    <Failed error={dimError} />
                ) : shares.length === 0 ? (
                    <Panel>
                        <EmptyState title={t('people.empty', { dim: dimInline })} hint={t('people.emptyHint')} />
                    </Panel>
                ) : (
                    <Panel className="flex flex-col gap-5 p-5">
                        <ShareBars
                            shares={shares}
                            label={t('people.barsLabel', { dim: dimInline })}
                            total={shareBase}
                            format={n => t('people.usersShort', { n: formatNumber(n, lng) })}
                        />
                        <div className="flex flex-col gap-1 border-t border-border pt-4 text-[13px] leading-relaxed text-muted-foreground">
                            <p>{t('people.missing', { n: formatNumber(totalUsers, lng) })}</p>
                            {dimBuckets.length > dimAsked.length && (
                                <p>{t('people.more', { n: String(dimAsked.length) })}</p>
                            )}
                        </div>
                    </Panel>
                )}
            </section>

            {dim === 'appVersion' && (
                <section className="flex flex-col gap-3">
                    <SectionTitle title={t('adoption.title')} hint={t('adoption.hint')} />
                    {versionsLoading ? (
                        <Loading />
                    ) : versionsError ? (
                        <Failed error={versionsError} />
                    ) : days.length === 0 || columns.length === 0 ? (
                        <Panel>
                            <EmptyState title={t('adoption.empty')} />
                        </Panel>
                    ) : (
                        <Panel className="overflow-x-auto">
                            <table className={tableClass.table}>
                                <thead className={tableClass.head}>
                                    <tr>
                                        <th className={tableClass.th}>{t('adoption.day')}</th>
                                        {columns.map(version => (
                                            <th key={version} className={tableClass.thNum}>
                                                {version}
                                            </th>
                                        ))}
                                        <th className={tableClass.thNum}>{t('adoption.dayTotal')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {days.map(day => (
                                        <tr key={day.day} className={tableClass.row}>
                                            <td className={`${tableClass.td} whitespace-nowrap`}>
                                                {formatDay(day.day, lng)}
                                            </td>
                                            {day.cells.map(cell => (
                                                <td
                                                    key={cell.version}
                                                    className={`${tableClass.tdNum} whitespace-nowrap`}
                                                >
                                                    {cell.share === undefined
                                                        ? '—'
                                                        : t('adoption.cell', {
                                                              pct: formatShare(cell.share),
                                                              n: formatNumber(cell.users, lng),
                                                          })}
                                                </td>
                                            ))}
                                            <td className={`${tableClass.tdNum} whitespace-nowrap`}>
                                                {formatNumber(day.total, lng)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Panel>
                    )}
                </section>
            )}
        </>
    );
};
