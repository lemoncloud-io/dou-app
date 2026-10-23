/**
 * `hooks/report-logs/use-log-console-state.ts`
 * - Single owner of the console's filters, tracking pins and view mode, all kept in the URL.
 *
 * The URL is the store, not a mirror of one. Tracking is collaborative work — "look at
 * this user's logs around this time" has to survive a refresh and travel in a chat
 * message — and memberships already set that precedent for this console
 * (`MembershipsPage`).
 *
 * The axes are split into two groups, and the split is the important part:
 *
 * - **server axes** (`stage`/`type`/`from`/`to`/`level`/`uid`/`cid`/`runId`) go to the
 *   backend, so changing one invalidates the collected corpus and starts a new walk.
 * - **client axes** (`q` and the facets, plus `mode`) only re-derive from rows already in
 *   memory, so changing one is instant and must NOT re-fetch.
 *
 * Keeping them in separate objects is what lets `useLogCorpus` depend on the first and
 * ignore the second, rather than every keystroke in the search box throwing away 5,000
 * collected rows.
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ROUND_2_AXES, type ReportKind, type ReportStage } from '../api/reportLogApi';
import { FACET_KEYS, type FacetKey, type FacetSelection } from '../lib/logFacets';
import { RECORD_FILTERS, type RecordFilter, type RecordKind } from '../lib/recordKinds';
import { PIN_KEYS, type PinKey } from '../lib/pinAxes';

/** Which of the four views the middle column shows. */
export type ViewMode = 'list' | 'group' | 'time' | 'timeline' | 'stats';

export type { PinKey };

const VIEW_MODES: ViewMode[] = ['list', 'group', 'time', 'timeline', 'stats'];

const TIMELINE_KINDS: RecordKind[] = ['log', 'trace', 'sample', 'event'];

/**
 * Facets that are genuinely client-side.
 *
 * `level` is counted as a facet (the rail shows the level breakdown of the corpus) but it
 * is filtered **server-side**, so it belongs to the server axes and must not be read or
 * cleared as a client one — clearing it would silently discard the corpus narrowing and
 * force a fresh 5,000-row walk. `buildFacets` still counts it; only the selection and the
 * reset are restricted here.
 */
const CLIENT_FACET_KEYS = FACET_KEYS.filter((key): key is Exclude<FacetKey, 'level'> => key !== 'level');
const REPORT_KINDS: ReportKind[] = ['all', 'error', 'issue', 'log-entry'];

/** Server-side axes. These define the corpus. */
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

/** Client-side axes. These only narrow what is already collected. */
export interface ClientAxes {
    query: string;
    facets: FacetSelection;
    /** Which records the list shows — logs by default (`record` in the URL). */
    record: RecordFilter;
}

/** The statistics view: one tag, read by one measure, split by one dimension. All in the URL. */
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
    /** Record kinds the run timeline shows (`show` in the URL); every kind by default. */
    timelineKinds: RecordKind[];
    setRecord: (value: RecordFilter) => void;
    setStats: (patch: Partial<StatsView>) => void;
    toggleTimelineKind: (kind: RecordKind) => void;
    /** Pins currently set, in a fixed order, for the chip row. */
    pins: Array<{ key: PinKey; value: string }>;
    setServerAxis: (patch: Partial<Record<keyof ServerAxes, string>>) => void;
    setQuery: (value: string) => void;
    setFacet: (key: FacetKey, value: string) => void;
    setMode: (mode: ViewMode) => void;
    /** Pin an axis. Pinning `runId` also switches to the timeline — that is why you pin it. */
    pin: (key: PinKey, value: string) => void;
    unpin: (key: PinKey) => void;
    /** Drop every client-side narrowing, keeping the corpus and the pins. */
    clearClientAxes: () => void;
}

const oneOf = <T extends string>(value: string | null, allowed: T[], fallback: T): T =>
    value && (allowed as string[]).includes(value) ? (value as T) : fallback;

export const useLogConsoleState = (): LogConsoleState => {
    const [searchParams, setSearchParams] = useSearchParams();

    const read = useCallback((key: string) => searchParams.get(key) ?? '', [searchParams]);

    const server = useMemo<ServerAxes>(
        () => ({
            stage: oneOf<ReportStage>(searchParams.get('stage'), ['v1', 'd1'], 'v1'),
            kind: oneOf<ReportKind>(searchParams.get('kind'), REPORT_KINDS, 'all'),
            from: read('from'),
            to: read('to'),
            level: read('level'),
            uid: read('uid'),
            cid: read('cid'),
            runId: read('runId'),
            // Read from the SAME search params the facet dropdowns write, so one selection
            // narrows the corpus server-side and the client pass at the same time. Keeping both
            // is deliberate: until the backend deploy these params are silently ignored, and the
            // client pass is what still makes the selection do something.
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

    /** Write a patch, dropping keys whose value is empty so the URL stays readable. */
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
            // A run is one app session, so its logs are only meaningful in order — the
            // timeline is the view that shows that, and pinning a runId is the request for it.
            if (key === 'runId') patchParams({ runId: value, mode: 'timeline' });
            else patchParams({ [key]: value });
        },
        [patchParams]
    );

    const unpin = useCallback(
        (key: PinKey) => {
            // Dropping the run pin leaves the timeline with nothing to draw, so fall back
            // to the list instead of showing an empty view.
            if (key === 'runId') patchParams({ runId: '', mode: 'list' });
            else patchParams({ [key]: '' });
        },
        [patchParams]
    );

    const clearClientAxes = useCallback(
        () => patchParams({ q: '', record: '', ...Object.fromEntries(CLIENT_FACET_KEYS.map(key => [key, ''])) }),
        [patchParams]
    );

    // The default (`log`) stays out of the URL, like every other default here.
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

    // Every kind shown is the default and leaves the URL; none shown is written as `none`, so it is
    // not mistaken for the default on a reload.
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
