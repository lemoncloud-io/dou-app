/**
 * `stats/PerfDetails.tsx`
 * - The statistics tab's "performance details" view: where exactly it is slow or failing.
 *
 * Five sections, one statistic each, each fetched narrowed to its tag: room entry (how it ended,
 * stored-message use, time per entry path), server requests per endpoint, message sends, stalls
 * per screen, and the web vitals the overview does not carry (INP, CLS, TTFB). The computations are
 * in `lib/perfDetails.ts`; this file lays them out.
 *
 * Server requests, sends and stalls are sampled (about one run in five), so their counts are
 * estimates and say so; room entry and the web vitals are kept from every run. Each section stands
 * on its own: an empty one says so with a next step, and one whose fetch was cut short says its
 * numbers are from the newest part of the period.
 */
import { useMemo, useState, type ReactNode } from 'react';

import { useT, type Language } from '../../../i18n';
import { ShareBars, tableClass, type ChartTone } from '../components/console/charts';
import { EmptyState } from '../components/console/EmptyState';
import { ChoiceRow, Panel, Pill, SectionTitle, quietButton } from '../components/console/ui';
import type { ConsoleNav } from '../hooks/use-console-nav';
import { useStatRows, type StatRows } from '../hooks/use-stat-rows';
import {
    endpointStats,
    FAILURE_ALERT,
    MIN_TO_ALERT,
    NONE,
    otherVitals,
    ROOM_OUTCOMES,
    roomCacheUse,
    roomEntryPaths,
    roomOutcomes,
    SEND_GROUPS,
    sendStats,
    stallScreens,
    TOP_ENDPOINTS,
    VITAL_REFERENCE,
    type OtherVital,
    type SendGroupBy,
} from '../lib/perfDetails';
import { formatDuration, formatNumber } from '../lib/timeFormat';

interface PerfDetailsProps {
    nav: ConsoleNav;
}

type T = ReturnType<typeof useT>['t'];

const OUTCOME_TONE: Record<string, ChartTone> = { shown: 'good', timeout: 'error' };

const percentText = (rate: number | undefined, lng: Language): string =>
    rate === undefined ? '—' : `${formatNumber(rate * 100, lng, 1)}%`;

const durationText = (ms: number | undefined, lng: Language): string =>
    ms === undefined ? '—' : formatDuration(ms, lng);

/** A known attribute value in words, a missing one as "(no value)", anything else as it came. */
const valueLabel = (t: T, key: string, known: readonly string[], prefix: string): string => {
    if (key === NONE) return t('none');
    return known.includes(key) ? t(`${prefix}.${key}`) : key;
};

const errorText = 'text-red-600 dark:text-red-400 font-medium';

/** The loading, failed, empty and partial states every section shares, around its content. */
const SectionBody = ({
    stat,
    empty,
    emptyHint,
    estimated,
    children,
}: {
    stat: StatRows;
    empty: string;
    emptyHint: string;
    estimated?: boolean;
    children: () => ReactNode;
}) => {
    const { t } = useT('statsDetail');
    if (stat.loading) return <p className="text-sm text-muted-foreground">{t('common:fetch.loading')}</p>;
    if (stat.corpus.phase === 'failed') {
        return (
            <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {t('common:fetch.failed', { message: stat.corpus.error?.message ?? '-' })}
            </p>
        );
    }
    if (stat.rows.length === 0) {
        return (
            <Panel>
                <EmptyState title={empty} hint={emptyHint} />
            </Panel>
        );
    }
    return (
        <>
            {children()}
            {(estimated || stat.partial) && (
                <div className="flex flex-col gap-1 text-xs leading-relaxed text-muted-foreground">
                    {estimated && <p>{t('estimated')}</p>}
                    {stat.partial && <p>{t('partial')}</p>}
                </div>
            )}
        </>
    );
};

/** A table header cell; numeric ones align right, and a tooltip explains a term. */
const Th = ({ children, num, tip }: { children: ReactNode; num?: boolean; tip?: string }) => (
    <th scope="col" className={num ? tableClass.thNum : tableClass.th} title={tip}>
        {tip ? (
            <span className="cursor-help underline decoration-dotted underline-offset-4">{children}</span>
        ) : (
            children
        )}
    </th>
);

const TableBox = ({ children }: { children: ReactNode }) => (
    <Panel className="overflow-x-auto">
        <table className={tableClass.table}>{children}</table>
    </Panel>
);

const RoomEntry = ({ stat }: { stat: StatRows }) => {
    const { t, lng } = useT('statsDetail');
    const outcomes = useMemo(() => roomOutcomes(stat.rows), [stat.rows]);
    const cache = useMemo(() => roomCacheUse(stat.rows), [stat.rows]);
    const paths = useMemo(() => roomEntryPaths(stat.rows), [stat.rows]);
    const count = (n: number) => formatNumber(n, lng);
    return (
        <section className="flex flex-col gap-3">
            <SectionTitle title={t('room.title')} hint={t('room.hint')} />
            <SectionBody stat={stat} empty={t('room.empty')} emptyHint={t('room.emptyHint')}>
                {() => (
                    <>
                        <div className="grid gap-3 lg:grid-cols-2">
                            <Panel className="flex flex-col gap-4 p-5">
                                <h3 className="text-[15px] font-semibold text-foreground">{t('room.outcomeTitle')}</h3>
                                <ShareBars
                                    label={t('room.outcomeLabel')}
                                    format={count}
                                    tone="muted"
                                    shares={outcomes.map(({ key, count: value }) => ({
                                        key,
                                        value,
                                        label: valueLabel(t, key, ROOM_OUTCOMES, 'room.outcome'),
                                        tone: OUTCOME_TONE[key],
                                    }))}
                                />
                            </Panel>
                            <Panel className="flex flex-col gap-4 p-5">
                                <div className="flex flex-col gap-1">
                                    <h3 className="text-[15px] font-semibold text-foreground">
                                        {t('room.cacheTitle')}
                                    </h3>
                                    <p className="text-[13px] text-muted-foreground">{t('room.cacheHint')}</p>
                                </div>
                                <ShareBars
                                    label={t('room.cacheLabel')}
                                    format={count}
                                    shares={cache.map(({ key, count: value, median }) => ({
                                        key,
                                        value,
                                        label: key === NONE ? t('none') : key,
                                        sub: t('room.cacheMedian', { value: durationText(median, lng) }),
                                    }))}
                                />
                            </Panel>
                        </div>
                        <div className="flex flex-col gap-2">
                            <h3 className="text-[15px] font-semibold text-foreground">{t('room.pathTitle')}</h3>
                            <TableBox>
                                <thead className={tableClass.head}>
                                    <tr>
                                        <Th>{t('room.path')}</Th>
                                        <Th num>{t('room.count')}</Th>
                                        <Th num tip={t('medianTip')}>
                                            {t('median')}
                                        </Th>
                                        <Th num tip={t('p95Tip')}>
                                            {t('p95')}
                                        </Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paths.map(path => (
                                        <tr key={path.key} className={tableClass.row}>
                                            <td className={tableClass.td}>
                                                {path.key === NONE ? t('none') : path.key}
                                            </td>
                                            <td className={tableClass.tdNum}>{count(path.n)}</td>
                                            <td className={tableClass.tdNum}>{durationText(path.p50, lng)}</td>
                                            <td className={tableClass.tdNum}>{durationText(path.p95, lng)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </TableBox>
                        </div>
                    </>
                )}
            </SectionBody>
        </section>
    );
};

const BACKENDS = ['relay', 'cloud'];

const ServerRequests = ({ stat }: { stat: StatRows }) => {
    const { t, lng } = useT('statsDetail');
    const [showAll, setShowAll] = useState(false);
    const endpoints = useMemo(() => endpointStats(stat.rows), [stat.rows]);
    const shown = showAll ? endpoints : endpoints.slice(0, TOP_ENDPOINTS);
    const more = endpoints.length > TOP_ENDPOINTS;
    return (
        <section className="flex flex-col gap-3">
            <SectionTitle
                title={t('api.title')}
                hint={t('api.hint')}
                action={
                    more && stat.rows.length > 0 ? (
                        <button type="button" className={quietButton} onClick={() => setShowAll(v => !v)}>
                            {showAll
                                ? t('api.showTop', { n: String(TOP_ENDPOINTS) })
                                : t('api.showAll', { n: formatNumber(endpoints.length, lng) })}
                        </button>
                    ) : undefined
                }
            />
            <SectionBody stat={stat} empty={t('api.empty')} emptyHint={t('api.emptyHint')} estimated>
                {() => (
                    <TableBox>
                        <thead className={tableClass.head}>
                            <tr>
                                <Th>{t('api.endpoint')}</Th>
                                <Th num>{t('api.count')}</Th>
                                <Th num tip={t('medianTip')}>
                                    {t('median')}
                                </Th>
                                <Th num tip={t('p95Tip')}>
                                    {t('p95')}
                                </Th>
                                <Th num tip={t('api.failTip')}>
                                    {t('failRate')}
                                </Th>
                                <Th>{t('api.backend')}</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map(row => (
                                <tr key={row.key} className={tableClass.row}>
                                    <td className={`${tableClass.td} min-w-[14rem]`}>
                                        <span className="mr-2 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                                            {row.method === NONE ? '—' : row.method}
                                        </span>
                                        <span className="break-all font-mono text-[13px]">
                                            {row.endpoint === NONE ? t('none') : row.endpoint}
                                        </span>
                                    </td>
                                    <td className={tableClass.tdNum}>{formatNumber(row.estimated, lng)}</td>
                                    <td className={tableClass.tdNum}>{durationText(row.p50, lng)}</td>
                                    <td className={`${tableClass.tdNum} ${row.slow ? errorText : ''}`}>
                                        {durationText(row.p95, lng)}
                                    </td>
                                    <td className={`${tableClass.tdNum} ${row.failing ? errorText : ''}`}>
                                        {percentText(row.failureRate, lng)}
                                    </td>
                                    <td className={`${tableClass.td} whitespace-nowrap text-[13px]`}>
                                        {row.backends.length
                                            ? row.backends
                                                  .map(b => valueLabel(t, b, BACKENDS, 'api.backends'))
                                                  .join(' · ')
                                            : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </TableBox>
                )}
            </SectionBody>
        </section>
    );
};

const SEND_VALUES = ['root', 'reply', 'text'];

const MessageSend = ({ stat, nav }: { stat: StatRows; nav: ConsoleNav }) => {
    const { t, lng } = useT('statsDetail');
    const raw = nav.param('by');
    const by: SendGroupBy = (SEND_GROUPS as readonly string[]).includes(raw) ? (raw as SendGroupBy) : 'thread';
    const groups = useMemo(() => sendStats(stat.rows, by), [stat.rows, by]);
    return (
        <section className="flex flex-col gap-3">
            <SectionTitle
                title={t('send.title')}
                hint={t('send.hint')}
                action={
                    stat.rows.length > 0 ? (
                        <ChoiceRow
                            label={t('send.groupLabel')}
                            value={by}
                            options={SEND_GROUPS.map(value => ({ value, label: t(`send.groups.${value}`) }))}
                            onChange={next => nav.patch({ by: next === 'thread' ? '' : next })}
                        />
                    ) : undefined
                }
            />
            <SectionBody stat={stat} empty={t('send.empty')} emptyHint={t('send.emptyHint')} estimated>
                {() => (
                    <TableBox>
                        <thead className={tableClass.head}>
                            <tr>
                                <Th>{t(`send.groups.${by}`)}</Th>
                                <Th num>{t('send.count')}</Th>
                                <Th num tip={t('medianTip')}>
                                    {t('median')}
                                </Th>
                                <Th num tip={t('p95Tip')}>
                                    {t('p95')}
                                </Th>
                                <Th num>{t('failRate')}</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {groups.map(group => (
                                <tr key={group.key} className={tableClass.row}>
                                    <td className={tableClass.td}>
                                        {valueLabel(t, group.key, SEND_VALUES, 'send.values')}
                                    </td>
                                    <td className={tableClass.tdNum}>{formatNumber(group.estimated, lng)}</td>
                                    <td className={tableClass.tdNum}>{durationText(group.p50, lng)}</td>
                                    <td className={tableClass.tdNum}>{durationText(group.p95, lng)}</td>
                                    <td
                                        className={`${tableClass.tdNum} ${group.n >= MIN_TO_ALERT && (group.failureRate ?? 0) >= FAILURE_ALERT ? errorText : ''}`}
                                    >
                                        {percentText(group.failureRate, lng)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </TableBox>
                )}
            </SectionBody>
        </section>
    );
};

const Stalls = ({ stat }: { stat: StatRows }) => {
    const { t, lng } = useT('statsDetail');
    const screens = useMemo(() => stallScreens(stat.rows), [stat.rows]);
    return (
        <section className="flex flex-col gap-3">
            <SectionTitle title={t('stalls.title')} hint={t('stalls.hint')} />
            <SectionBody stat={stat} empty={t('stalls.empty')} emptyHint={t('stalls.emptyHint')} estimated>
                {() => (
                    <TableBox>
                        <thead className={tableClass.head}>
                            <tr>
                                <Th>{t('stalls.screen')}</Th>
                                <Th num>{t('stalls.visits')}</Th>
                                <Th num tip={t('stalls.totalTip')}>
                                    {t('stalls.total')}
                                </Th>
                                <Th num tip={t('stalls.worstTip')}>
                                    {t('stalls.worst')}
                                </Th>
                            </tr>
                        </thead>
                        <tbody>
                            {screens.map(row => (
                                <tr key={row.screen} className={tableClass.row}>
                                    <td className={`${tableClass.td} break-all font-mono text-[13px]`}>
                                        {row.screen === NONE ? t('none') : row.screen}
                                    </td>
                                    <td className={tableClass.tdNum}>{formatNumber(row.estimated, lng)}</td>
                                    <td className={tableClass.tdNum}>{durationText(row.medianTotalMs, lng)}</td>
                                    <td className={tableClass.tdNum}>{durationText(row.worstMaxMs, lng)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </TableBox>
                )}
            </SectionBody>
        </section>
    );
};

const vitalText = (vital: OtherVital, value: number | undefined, lng: Language): string => {
    if (value === undefined) return '—';
    return vital === 'cls' ? value.toFixed(2) : formatDuration(value, lng);
};

const WebVitals = ({ stat }: { stat: StatRows }) => {
    const { t, lng } = useT('statsDetail');
    const readings = useMemo(() => otherVitals(stat.rows), [stat.rows]);
    // Records of the tag that carry none of these three (FCP and LCP, read by the overview) are not
    // this section's records: with only those, the section is empty.
    const empty: StatRows = readings.some(reading => reading.n > 0) ? stat : { ...stat, rows: [] };
    return (
        <section className="flex flex-col gap-3">
            <SectionTitle title={t('vitals.title')} hint={t('vitals.hint')} />
            <SectionBody stat={empty} empty={t('vitals.empty')} emptyHint={t('vitals.emptyHint')}>
                {() => (
                    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {readings.map(reading => {
                            // INP is read against the product's reference; CLS and TTFB show the web
                            // standard's for orientation, without a verdict.
                            const verdict = reading.vital === 'inp' && reading.within !== undefined;
                            return (
                                <li key={reading.vital}>
                                    <Panel className="flex h-full flex-col gap-3 p-5">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex min-w-0 flex-col gap-1">
                                                <h3 className="text-[15px] font-semibold text-foreground">
                                                    {t(`vitals.name.${reading.vital}`)}
                                                </h3>
                                                <p className="text-[13px] leading-snug text-muted-foreground">
                                                    {t(`vitals.what.${reading.vital}`)}
                                                </p>
                                            </div>
                                            {verdict && (
                                                <Pill tone={reading.within ? 'good' : 'error'}>
                                                    {t(reading.within ? 'vitals.within' : 'vitals.over')}
                                                </Pill>
                                            )}
                                        </div>
                                        <span className="text-3xl font-semibold tabular-nums text-foreground">
                                            {vitalText(reading.vital, reading.p75, lng)}
                                        </span>
                                        <span className="text-[13px] text-muted-foreground">
                                            {t(`vitals.reference.${reading.vital}`, {
                                                value: vitalText(reading.vital, VITAL_REFERENCE[reading.vital], lng),
                                            })}
                                        </span>
                                        <span className="mt-auto text-xs text-muted-foreground">
                                            {reading.n > 0
                                                ? t('vitals.sample', { n: formatNumber(reading.n, lng) })
                                                : t('vitals.noData')}
                                        </span>
                                    </Panel>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </SectionBody>
        </section>
    );
};

export const PerfDetails = ({ nav }: PerfDetailsProps) => {
    const { stage, period } = nav;
    // One fetch per statistic, named rather than looped so the hooks keep a fixed order.
    const room = useStatRows(stage, period, 'perf.chat_room_open');
    const api = useStatRows(stage, period, 'perf.api_request');
    const send = useStatRows(stage, period, 'perf.chat_send');
    const stalls = useStatRows(stage, period, 'perf.long_tasks');
    const vitals = useStatRows(stage, period, 'perf.web_vitals');
    return (
        <>
            <RoomEntry stat={room} />
            <ServerRequests stat={api} />
            <MessageSend stat={send} nav={nav} />
            <Stalls stat={stalls} />
            <WebVitals stat={vitals} />
        </>
    );
};
