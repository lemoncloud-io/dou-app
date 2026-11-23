import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ROUND_2_AXES, type ReportStage } from '../api/reportLogApi';
import { FACET_KEYS } from '../lib/logFacets';
import { PERIOD_PRESETS, resolvePeriod, type PeriodInput, type PeriodPreset, type ResolvedPeriod } from '../lib/period';
import { openingStage } from '../../../config/stageEndpoints';

export const CONSOLE_TABS = ['user', 'errors', 'reports', 'stats', 'all'] as const;

export type ConsoleTab = (typeof CONSOLE_TABS)[number];

export const DEFAULT_PERIOD: Record<ConsoleTab, PeriodPreset> = {
    user: '7d',
    errors: '24h',
    reports: '7d',
    stats: '7d',
    all: 'today',
};

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
    periodInput: PeriodInput;
    period: ResolvedPeriod;
    setPeriod: (preset: PeriodPreset, custom?: { from?: string; to?: string }) => void;
    param: (key: string) => string;
    patch: (values: Record<string, string>) => void;
    go: (tab: ConsoleTab, values?: Record<string, string>) => void;
}

export const useConsoleNav = (): ConsoleNav => {
    const [searchParams, setSearchParams] = useSearchParams();
    const now = useNow();

    const tab = resolveTab(searchParams);
    const stageParam = searchParams.get('stage');
    const stage: ReportStage = stageParam === 'd1' || stageParam === 'v1' ? stageParam : openingStage();
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

    const setStage = useCallback((next: ReportStage) => patch({ stage: next === openingStage() ? '' : next }), [patch]);

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
