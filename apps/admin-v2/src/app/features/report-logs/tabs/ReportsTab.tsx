/**
 * `tabs/ReportsTab.tsx`
 * - Issue reports as an inbox: who wrote in, about what, from which app, and what they attached.
 *
 * Opening a report shows what the user wrote and saw, and one button that answers the next question
 * — "what was happening to them at that moment?" — by opening that user's timeline on the half hour
 * either side of the report.
 *
 * Reports are fetched by their own stored type (`stereo=issue`) on the server. A report is written
 * without a top-level `uid`, so the server cannot narrow them by user; the reporter id lives inside
 * the report and is read from there.
 */
import { useMemo, useState } from 'react';

import { ArrowLeft, Paperclip, Search } from 'lucide-react';

import { useT } from '../../../i18n';
import { STEREO_BY_KIND } from '../api/reportLogApi';
import { EmptyState } from '../components/console/EmptyState';
import { FetchNotice } from '../components/console/FetchNotice';
import { PeriodPicker } from '../components/console/PeriodPicker';
import { Stamp } from '../components/console/Stamp';
import { Panel, Pill, primaryButton } from '../components/console/ui';
import { ReportDetailBody } from '../components/ReportDetailBody';
import type { ConsoleNav } from '../hooks/use-console-nav';
import { useLogCorpus } from '../hooks/use-log-corpus';
import { byEventAtDesc, eventAt } from '../lib/eventTime';
import { makeQueryMatcher } from '../lib/logFacets';
import type { ReportLogRow } from '../lib/parseReportLog';
import { inWindow, widerPreset } from '../lib/period';

interface ReportsTabProps {
    nav: ConsoleNav;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

/** A short device line from whatever the report's `device` carried — its shape varies by app. */
const deviceText = (row: ReportLogRow): string | undefined => {
    const device = isRecord(row.payload?.device) ? row.payload.device : undefined;
    if (!device) return undefined;
    const pick = (...keys: string[]) =>
        keys.map(key => device[key]).find(v => typeof v === 'string' && v) as string | undefined;
    const os = [pick('os', 'platform', 'osName'), pick('osVersion', 'version')].filter(Boolean).join(' ');
    return [pick('model', 'deviceModel', 'name'), os].filter(Boolean).join(' · ') || undefined;
};

const ReportView = ({ row, nav, onBack }: { row: ReportLogRow; nav: ConsoleNav; onBack: () => void }) => {
    const { t } = useT('reports');
    const at = eventAt(row);
    const reporter =
        row.userName ?? (row.userId ? t('common:user.anonymous', { id: row.userId }) : t('common:user.unknown'));
    const app = [
        row.app,
        row.appVersion && t('common:device.app', { version: row.appVersion }),
        row.webVersion && t('common:device.web', { version: row.webVersion }),
    ]
        .filter(Boolean)
        .join(' · ');
    const facts: Array<[string, string | undefined]> = [
        [t('detail.user'), reporter],
        [t('detail.app'), app || undefined],
        [t('detail.device'), deviceText(row)],
        [t('detail.screen'), row.route],
    ];

    return (
        <article className="flex flex-col gap-6">
            <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-primary hover:underline lg:hidden"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden /> {t('detail.back')}
            </button>
            <header className="flex flex-col items-start gap-3">
                <Pill tone="report">{t('detail.badge')}</Pill>
                <h2 className="break-words text-xl font-semibold leading-snug text-foreground">{row.title}</h2>
                <Stamp ms={at} className="text-sm text-muted-foreground" />
                <div className="pt-1">
                    <button
                        type="button"
                        disabled={!row.userId || at === undefined}
                        title={!row.userId ? t('detail.noUser') : undefined}
                        onClick={() =>
                            row.userId && at !== undefined && nav.go('user', { uid: row.userId, at: String(at) })
                        }
                        className={primaryButton}
                    >
                        {t('common:actions.logsAtThatTime')}
                    </button>
                </div>
            </header>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2.5 rounded-xl border border-border bg-background/50 p-4 text-sm">
                {facts
                    .filter(([, value]) => !!value)
                    .map(([label, value]) => (
                        <div key={label} className="contents">
                            <dt className="text-muted-foreground">{label}</dt>
                            <dd className="break-words text-foreground">{value}</dd>
                        </div>
                    ))}
            </dl>
            {row.message && (
                <section className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{t('detail.body')}</h3>
                    <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground">
                        {row.message}
                    </p>
                </section>
            )}
            {row.images && row.images.length > 0 && (
                <section className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold text-foreground">
                        {t('detail.screenshots', { count: row.images.length })}
                    </h3>
                    <ul className="flex flex-wrap gap-3">
                        {row.images.map((src, i) => (
                            <li key={i}>
                                <a href={src} target="_blank" rel="noreferrer" title={t('detail.openImage')}>
                                    <img
                                        src={src}
                                        alt={t('detail.screenshotAlt', { index: i + 1 })}
                                        className="h-56 w-auto rounded-xl border border-border object-contain transition-opacity hover:opacity-90"
                                    />
                                </a>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            <details className="rounded-xl border border-border">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground">
                    {t('detail.developer')}
                </summary>
                <div className="flex flex-col gap-5 border-t border-border p-4">
                    <ReportDetailBody row={row} />
                </div>
            </details>
        </article>
    );
};

export const ReportsTab = ({ nav }: ReportsTabProps) => {
    const { t } = useT('reports');
    const { period } = nav;
    const selectedId = nav.param('report');
    const [query, setQuery] = useState('');

    const corpus = useLogCorpus({
        stage: nav.stage,
        from: period.fromDate,
        to: period.toDate,
        type: STEREO_BY_KIND.issue,
    });

    const reports = useMemo(() => {
        const matches = makeQueryMatcher(query);
        return (
            corpus.rows
                // The stored type is shared with older error records written before reports had their own.
                .filter(row => row.type === 'issue' && inWindow(eventAt(row), period) && matches(row))
                .sort(byEventAtDesc)
        );
    }, [corpus.rows, period, query]);

    const selected = selectedId ? corpus.rows.find(row => row.id === selectedId) : undefined;
    const wider = widerPreset(period.preset);
    const loading = corpus.phase === 'collecting' && corpus.loaded === 0;

    const inbox = (
        <div className="flex flex-col gap-3">
            <label className="relative">
                <span className="sr-only">{t('search.label')}</span>
                <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                />
                <input
                    type="search"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder={t('search.placeholder')}
                    className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
            </label>
            <FetchNotice corpus={corpus} />
            {loading ? null : reports.length === 0 ? (
                <Panel>
                    <EmptyState
                        title={query ? t('empty.noMatch') : t('empty.title')}
                        action={
                            !query && wider
                                ? { label: t('common:empty.widen'), onClick: () => nav.setPeriod(wider) }
                                : undefined
                        }
                    />
                </Panel>
            ) : (
                <Panel className="overflow-hidden">
                    <ul className="divide-y divide-border" aria-label={t('inbox.label')}>
                        {reports.map((row, index) => {
                            const active = row.id === selectedId;
                            return (
                                <li key={row.id || index}>
                                    <button
                                        type="button"
                                        onClick={() => nav.patch({ report: row.id })}
                                        aria-current={active ? 'true' : undefined}
                                        className={`flex w-full flex-col gap-1.5 border-l-[3px] px-4 py-3.5 text-left transition-colors ${
                                            active
                                                ? 'border-blue-500 bg-blue-500/[0.08]'
                                                : 'border-transparent hover:bg-muted/40'
                                        }`}
                                    >
                                        <span className="flex items-start justify-between gap-3">
                                            <span className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">
                                                {row.title}
                                            </span>
                                            {row.images && row.images.length > 0 && (
                                                <span
                                                    className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-xs text-muted-foreground"
                                                    title={t('inbox.attachments', { count: row.images.length })}
                                                >
                                                    <Paperclip className="h-3.5 w-3.5" aria-hidden />
                                                    {row.images.length}
                                                </span>
                                            )}
                                        </span>
                                        <span className="truncate text-[13px] text-muted-foreground">
                                            <span className="font-medium text-foreground/80">
                                                {row.userName ??
                                                    (row.userId
                                                        ? t('common:user.anonymous', { id: row.userId })
                                                        : t('common:user.unknown'))}
                                            </span>
                                            {(row.app || row.appVersion) &&
                                                `  ·  ${[row.app, row.appVersion].filter(Boolean).join(' ')}`}
                                        </span>
                                        <Stamp ms={eventAt(row)} agoFirst className="text-xs text-muted-foreground" />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </Panel>
            )}
        </div>
    );

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto lg:overflow-hidden">
            <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-6 sm:px-8">
                <Panel className="p-5">
                    <PeriodPicker
                        period={period}
                        from={nav.param('from') || undefined}
                        to={nav.param('to') || undefined}
                        onChange={nav.setPeriod}
                    />
                </Panel>
                <div className="flex min-h-0 flex-1 gap-6">
                    <div
                        className={`min-h-0 w-full shrink-0 overflow-auto lg:block lg:w-[26rem] ${selectedId ? 'hidden' : ''}`}
                    >
                        {inbox}
                    </div>
                    <div className={`min-h-0 min-w-0 flex-1 overflow-auto ${selectedId ? '' : 'hidden lg:block'}`}>
                        <Panel className="min-h-full p-6">
                            {selected ? (
                                <ReportView row={selected} nav={nav} onBack={() => nav.patch({ report: '' })} />
                            ) : selectedId && !loading ? (
                                <EmptyState
                                    title={t('detail.notFound')}
                                    hint={t('detail.notFoundHint')}
                                    action={{ label: t('detail.back'), onClick: () => nav.patch({ report: '' }) }}
                                />
                            ) : (
                                !loading && <EmptyState title={t('detail.pick')} />
                            )}
                        </Panel>
                    </div>
                </div>
            </div>
        </div>
    );
};
