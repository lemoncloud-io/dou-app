import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ROUND_2_AXES, type ReportKind, type ReportStage } from '../api/reportLogApi';
import { FACET_KEYS, type FacetKey, type FacetSelection } from '../lib/logFacets';
import { RECORD_FILTERS, type RecordFilter, type RecordKind } from '../lib/recordKinds';
import { isKstDate } from '../lib/period';
import { PIN_KEYS, type PinKey } from '../lib/pinAxes';
import { openingStage } from '../../../config/stageEndpoints';

export type ViewMode = 'list' | 'group' | 'time' | 'timeline' | 'stats';

export type { PinKey };

const VIEW_MODES: ViewMode[] = ['list', 'group', 'time', 'timeline', 'stats'];

const TIMELINE_KINDS: RecordKind[] = ['log', 'trace', 'sample', 'event'];

const CLIENT_FACET_KEYS = FACET_KEYS.filter((key): key is Exclude<FacetKey, 'level'> => key !== 'level');
const REPORT_KINDS: ReportKind[] = ['all', 'error', 'issue', 'log-entry'];

export interface ServerAxes extends Record<(typeof ROUND_2_AXES)[number], string> {
    stage: ReportStage;
    kind: ReportKind;
    from: string;
    to: string;
    level: string;
    uid: string;
    cid: string;
    runId: string;
}

export interface ClientAxes {
    query: string;
    facets: FacetSelection;
    record: RecordFilter;
}

export interface StatsView {
    tag: string;
    measure: string;
    by: string;
}

export interface LogConsoleState {
    server: ServerAxes;
    client: ClientAxes;
    mode: ViewMode;
    stats: StatsView;
    timelineKinds: RecordKind[];
    setRecord: (value: RecordFilter) => void;
    setStats: (patch: Partial<StatsView>) => void;
    toggleTimelineKind: (kind: RecordKind) => void;
    pins: Array<{ key: PinKey; value: string }>;
    setServerAxis: (patch: Partial<Record<keyof ServerAxes, string>>) => void;
    setQuery: (value: string) => void;
    setFacet: (key: FacetKey, value: string) => void;
    setMode: (mode: ViewMode) => void;
    pin: (key: PinKey, value: string) => void;
    unpin: (key: PinKey) => void;
    clearClientAxes: () => void;
}

const oneOf = <T extends string>(value: string | null, allowed: T[], fallback: T): T =>
    value && (allowed as string[]).includes(value) ? (value as T) : fallback;

export const useLogConsoleState = (): LogConsoleState => {
    const [searchParams, setSearchParams] = useSearchParams();

    const read = useCallback((key: string) => searchParams.get(key) ?? '', [searchParams]);
    const readDate = useCallback(
        (key: string) => {
            const value = searchParams.get(key) ?? '';
            return isKstDate(value) ? value : '';
        },
        [searchParams]
    );

    const server = useMemo<ServerAxes>(
        () => ({
            stage: oneOf<ReportStage>(searchParams.get('stage'), ['v1', 'd1'], openingStage()),
            kind: oneOf<ReportKind>(searchParams.get('kind'), REPORT_KINDS, 'all'),
            from: readDate('from'),
            to: readDate('to'),
            level: read('level'),
            uid: read('uid'),
            cid: read('cid'),
            runId: read('runId'),
            ...(Object.fromEntries(ROUND_2_AXES.map(axis => [axis, read(axis)])) as Record<
                (typeof ROUND_2_AXES)[number],
                string
            >),
        }),
        [searchParams, read]
    );

    const client = useMemo<ClientAxes>(() => {
        const facets = CLIENT_FACET_KEYS.reduce<FacetSelection>((acc, key) => {
            const value = searchParams.get(key);
            if (value) acc[key] = value;
            return acc;
        }, {});
        return {
            query: read('q'),
            facets,
            record: oneOf<RecordFilter>(searchParams.get('record'), [...RECORD_FILTERS], 'log'),
        };
    }, [searchParams, read]);

    const stats = useMemo<StatsView>(() => ({ tag: read('stat'), measure: read('measure'), by: read('by') }), [read]);

    const timelineKinds = useMemo<RecordKind[]>(() => {
        const raw = searchParams.get('show');
        if (raw === null) return TIMELINE_KINDS;
        return raw.split(',').filter((kind): kind is RecordKind => (TIMELINE_KINDS as string[]).includes(kind));
    }, [searchParams]);

    const mode = oneOf<ViewMode>(searchParams.get('mode'), VIEW_MODES, 'list');

    const pins = useMemo(() => PIN_KEYS.map(key => ({ key, value: server[key] })).filter(pin => !!pin.value), [server]);

    const patchParams = useCallback(
        (patch: Record<string, string>) => {
            setSearchParams(
                prev => {
                    const next = new URLSearchParams(prev);
                    Object.entries(patch).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
                    return next;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );

    const setServerAxis = useCallback(
        (patch: Partial<Record<keyof ServerAxes, string>>) => patchParams(patch as Record<string, string>),
        [patchParams]
    );

    const setQuery = useCallback((value: string) => patchParams({ q: value }), [patchParams]);

    const setFacet = useCallback((key: FacetKey, value: string) => patchParams({ [key]: value }), [patchParams]);

    const setMode = useCallback((next: ViewMode) => patchParams({ mode: next }), [patchParams]);

    const pin = useCallback(
        (key: PinKey, value: string) => {
            if (key === 'runId') patchParams({ runId: value, mode: 'timeline' });
            else patchParams({ [key]: value });
        },
        [patchParams]
    );

    const unpin = useCallback(
        (key: PinKey) => {
            if (key === 'runId') patchParams({ runId: '', mode: 'list' });
            else patchParams({ [key]: '' });
        },
        [patchParams]
    );

    const clearClientAxes = useCallback(
        () => patchParams({ q: '', record: '', ...Object.fromEntries(CLIENT_FACET_KEYS.map(key => [key, ''])) }),
        [patchParams]
    );

    const setRecord = useCallback(
        (value: RecordFilter) => patchParams({ record: value === 'log' ? '' : value }),
        [patchParams]
    );

    const setStats = useCallback(
        (patch: Partial<StatsView>) =>
            patchParams({
                ...(patch.tag !== undefined ? { stat: patch.tag } : {}),
                ...(patch.measure !== undefined ? { measure: patch.measure } : {}),
                ...(patch.by !== undefined ? { by: patch.by } : {}),
            }),
        [patchParams]
    );

    const toggleTimelineKind = useCallback(
        (kind: RecordKind) => {
            const next = timelineKinds.includes(kind)
                ? timelineKinds.filter(k => k !== kind)
                : TIMELINE_KINDS.filter(k => k === kind || timelineKinds.includes(k));
            patchParams({ show: next.length === TIMELINE_KINDS.length ? '' : next.join(',') || 'none' });
        },
        [patchParams, timelineKinds]
    );

    return {
        server,
        client,
        mode,
        stats,
        timelineKinds,
        setRecord,
        setStats,
        toggleTimelineKind,
        pins,
        setServerAxis,
        setQuery,
        setFacet,
        setMode,
        pin,
        unpin,
        clearClientAxes,
    };
};
