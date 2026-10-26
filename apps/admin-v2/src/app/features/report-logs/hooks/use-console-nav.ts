/**
 * `hooks/report-logs/use-console-nav.ts`
 * - Which tab is open, which server it reads, and the period — all in the URL, like the rest.
 *
 * The console opens on what someone came to do — find a user, watch errors, read reports, check
 * the numbers — and the developer's full log view is one of those tabs rather than the front door.
 * The URL stays the store so a link pasted into a chat opens the same tab, the same user and the
 * same period for whoever clicks it.
 *
 * **Old links keep working.** Links shared before the tabs existed carry the full-log view's
 * parameters (`mode`, `kind`, `runId`, a date range, …) and no `tab`. Those open the full-log tab,
 * where they mean what they always meant. A bare `?uid=` opens the user tab, which is what such a
 * link was for.
 *
 * Switching tabs is a navigation (it pushes history, so Back returns), and it drops every other
 * tab's parameters except the server: a period chosen for errors is not the period someone
 * expects when they open a user, and a stale parameter nobody can see is worse than a default.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ROUND_2_AXES, type ReportStage } from '../api/reportLogApi';
import { FACET_KEYS } from '../lib/logFacets';
import { PERIOD_PRESETS, resolvePeriod, type PeriodInput, type PeriodPreset, type ResolvedPeriod } from '../lib/period';

export const CONSOLE_TABS = ['user', 'errors', 'reports', 'stats', 'all'] as const;

export type ConsoleTab = (typeof CONSOLE_TABS)[number];

/** Each tab's period when the URL names none. */
export const DEFAULT_PERIOD: Record<ConsoleTab, PeriodPreset> = {
    user: '7d',
    errors: '24h',
    reports: '7d',
    stats: '7d',
    // The full-log tab keeps its own open date range and ignores this.
    all: 'today',
};

/** Parameters only the full-log view ever wrote — their presence without `tab` marks an old link. */
const LEGACY_KEYS = [
    'mode',
    'kind',
    'record',
    'level',
    'q',
    'runId',
    'cid',
    'show',
    'stat',
    'measure',
    'by',
    'from',
    'to',
    ...FACET_KEYS,
    ...ROUND_2_AXES,
];

export const resolveTab = (params: URLSearchParams): ConsoleTab => {
    const tab = params.get('tab');
    if (tab && (CONSOLE_TABS as readonly string[]).includes(tab)) return tab as ConsoleTab;
    return LEGACY_KEYS.some(key => params.has(key)) ? 'all' : 'user';
};

/** Re-resolve rolling periods once a minute, so "last hour" keeps meaning the last hour. */
const NOW_TICK_MS = 60_000;

const useNow = (): number => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
        return () => clearInterval(timer);
    }, []);
    return now;
};

export interface ConsoleNav {
    tab: ConsoleTab;
    stage: ReportStage;
    setStage: (stage: ReportStage) => void;
    /** The period as the URL says it, and as resolved against now. */
    periodInput: PeriodInput;
    period: ResolvedPeriod;
    setPeriod: (preset: PeriodPreset, custom?: { from?: string; to?: string }) => void;
    /** A raw parameter, `''` when absent. */
    param: (key: string) => string;
    /** Rewrite parameters in place (no history entry); empty values are removed. */
    patch: (values: Record<string, string>) => void;
    /** Open a tab, optionally with its parameters — a history entry, keeping only the server. */
    go: (tab: ConsoleTab, values?: Record<string, string>) => void;
}

export const useConsoleNav = (): ConsoleNav => {
    const [searchParams, setSearchParams] = useSearchParams();
    const now = useNow();

    const tab = resolveTab(searchParams);
    const stage: ReportStage = searchParams.get('stage') === 'd1' ? 'd1' : 'v1';
    const param = useCallback((key: string) => searchParams.get(key) ?? '', [searchParams]);

    const periodInput = useMemo<PeriodInput>(() => {
        const raw = searchParams.get('period');
        const at = Number(searchParams.get('at'));
        if (searchParams.has('at') && Number.isFinite(at) && at > 0) return { preset: 'around', at };
        const preset =
            raw && (PERIOD_PRESETS as readonly string[]).includes(raw) ? (raw as PeriodPreset) : DEFAULT_PERIOD[tab];
        return {
            preset,
            from: searchParams.get('from') ?? undefined,
            to: searchParams.get('to') ?? undefined,
        };
    }, [searchParams, tab]);

    const period = useMemo(() => resolvePeriod(periodInput, now), [periodInput, now]);

    // Pin the resolved tab into the URL. A link without `tab` is read by its parameters, so leaving
    // it implicit lets a later edit change the tab under the reader: choosing custom dates on the
    // default user tab writes `from`/`to`, which an old full-log link also carries.
    useEffect(() => {
        if (searchParams.has('tab')) return;
        setSearchParams(
            prev => {
                const next = new URLSearchParams(prev);
                next.set('tab', resolveTab(prev));
                return next;
            },
            { replace: true }
        );
    }, [searchParams, setSearchParams]);

    const patch = useCallback(
        (values: Record<string, string>) =>
            setSearchParams(
                prev => {
                    const next = new URLSearchParams(prev);
                    Object.entries(values).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
                    return next;
                },
                { replace: true }
            ),
        [setSearchParams]
    );

    const go = useCallback(
        (target: ConsoleTab, values: Record<string, string> = {}) =>
            setSearchParams(prev => {
                const next = new URLSearchParams();
                next.set('tab', target);
                const keptStage = prev.get('stage');
                if (keptStage) next.set('stage', keptStage);
                Object.entries(values).forEach(([key, value]) => value && next.set(key, value));
                return next;
            }),
        [setSearchParams]
    );

    const setStage = useCallback((next: ReportStage) => patch({ stage: next === 'v1' ? '' : next }), [patch]);

    const setPeriod = useCallback(
        (preset: PeriodPreset, custom?: { from?: string; to?: string }) =>
            patch({
                period: preset === DEFAULT_PERIOD[tab] ? '' : preset,
                at: '',
                from: preset === 'custom' ? (custom?.from ?? '') : '',
                to: preset === 'custom' ? (custom?.to ?? '') : '',
            }),
        [patch, tab]
    );

    return { tab, stage, setStage, periodInput, period, setPeriod, param, patch, go };
};
