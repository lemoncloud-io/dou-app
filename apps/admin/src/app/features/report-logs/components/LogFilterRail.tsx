/**
 * `components/report-logs/LogFilterRail.tsx`
 * - The left column: every filter, grouped by whether the server or the browser applies it.
 *
 * The grouping is the whole point of the layout. A server axis re-queries the entire
 * dataset and restarts the corpus walk; a client axis only re-derives from rows already in
 * memory. Those are different operations with different reach and different cost, and an
 * operator reading a count needs to know which kind produced it — so the rail states it
 * per group instead of leaving the two indistinguishable, as the old single filter bar did.
 *
 * Only the filters reached for every time stay in view — level, the date range and the search.
 * The rest (kind, record type, every facet) sit under "Advanced filters", which opens on its own
 * when one of them is set: a narrowing hidden behind a closed fold would leave a count on screen
 * with nothing visible to explain it. The server switch is not here at all; the page header
 * above every tab owns it.
 *
 * The text field holds its own state and settles into the URL on a delay, matching
 * `MembershipsPage`. Without it every keystroke writes a URL and re-runs a filter plus a
 * sort over the whole corpus — up to 5,000 rows synchronously, per character.
 */
import { useEffect, useRef, useState } from 'react';

import { useDebounce } from '@chatic/shared';

import { useT } from '../../../i18n';
import type { ReportKind } from '../api/reportLogApi';
import type { ServerAxes } from '../hooks/use-log-console-state';
import type { FacetKey, Facets } from '../lib/logFacets';
import type { FacetSelection } from '../lib/logFacets';
import { RECORD_FILTERS, type RecordFilter } from '../lib/recordKinds';
import { formatNumber } from '../lib/timeFormat';

interface LogFilterRailProps {
    server: ServerAxes;
    onServerAxis: (patch: Partial<Record<keyof ServerAxes, string>>) => void;
    query: string;
    onQuery: (value: string) => void;
    facets: Facets;
    selection: FacetSelection;
    onFacet: (key: FacetKey, value: string) => void;
    onClearClient: () => void;
    /** Logs, statistics, or both. Client-side: the server stores no `kind` axis to filter on. */
    record: RecordFilter;
    onRecord: (value: RecordFilter) => void;
    /** Rows the client-side filters are working over, for the group's caption. */
    corpusSize: number;
}

/** Each kind with the `rail.kinds.*` key that names it. */
const KINDS: Array<{ value: ReportKind; key: string }> = [
    { value: 'all', key: 'all' },
    { value: 'log-entry', key: 'logEntry' },
    { value: 'issue', key: 'issue' },
    { value: 'error', key: 'error' },
];

/** Level values are the wire values, shown as they are; only "all" is a word. */
const LEVELS = ['', 'error', 'warn', 'info', 'debug'];

/**
 * Facets worth a dropdown, in the order an operator reaches for them.
 *
 * The dropdown still lists what the CORPUS holds, with counts — that is the discoverability a
 * text input cannot give. What changed is where the selection lands: the axes marked `onServer`
 * were lifted to top-level fields by a backend change, so choosing one re-collects the
 * corpus narrowed on the server instead of only hiding rows already fetched.
 */
const CLIENT_FACETS: Array<{ key: FacetKey; onServer?: true }> = [
    // Before the tag: the area holds a feature's old tag (`SOCKET`) and its event tags
    // (`socket.reconnect_failed`) together, so it is the axis that survives the switch-over.
    { key: 'area' },
    { key: 'tag', onServer: true },
    { key: 'appVersion', onServer: true },
    { key: 'webVersion', onServer: true },
    { key: 'route', onServer: true },
    { key: 'source' },
    { key: 'app' },
    { key: 'env' },
    { key: 'os', onServer: true },
    { key: 'osVersion', onServer: true },
    { key: 'model', onServer: true },
];

const fieldClass =
    'w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring';

const captionClass = 'text-[11px] leading-snug text-muted-foreground';

const Group = ({
    title,
    caption,
    children,
    action,
}: {
    title: string;
    caption?: string;
    children: React.ReactNode;
    action?: React.ReactNode;
}) => (
    <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground">{title}</h2>
            {action}
        </div>
        {caption && <p className={captionClass}>{caption}</p>}
        {children}
    </section>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
        {label}
        {children}
    </label>
);

/** Delay before a keystroke reaches the URL. Same value memberships settled on. */
const QUERY_SETTLE_MS = 300;

export const LogFilterRail = ({
    server,
    onServerAxis,
    query,
    onQuery,
    facets,
    selection,
    onFacet,
    onClearClient,
    record,
    onRecord,
    corpusSize,
}: LogFilterRailProps) => {
    const { t, lng } = useT('allLogs');
    // Local draft so typing stays instant; `query` remains the source of truth so a
    // shared link or a reset still lands in the box.
    const [draft, setDraft] = useState(query);
    useEffect(() => setDraft(query), [query]);
    const settled = useDebounce(draft, QUERY_SETTLE_MS);
    // `onQuery` is intentionally not a dependency: its identity changes with the router's
    // params, which would re-fire this with a `settled` value already written.
    const push = useRef(onQuery);
    push.current = onQuery;
    useEffect(() => {
        if (settled !== query) push.current(settled);
        // `query` is read, not depended on: it is what this effect writes, so listing it
        // would re-fire the effect with the value it just settled.
    }, [settled]);

    const hasFacet = Object.values(selection).some(Boolean);
    const hasClientNarrowing = !!query || hasFacet || record !== 'log';
    const hasAdvanced = server.kind !== 'all' || record !== 'log' || hasFacet;

    // Opens by itself when an advanced filter is set — on load from a shared link as much as
    // later — and otherwise stays where the operator left it.
    const [advancedOpen, setAdvancedOpen] = useState(hasAdvanced);
    useEffect(() => {
        if (hasAdvanced) setAdvancedOpen(true);
    }, [hasAdvanced]);

    return (
        <aside className="flex h-full w-64 shrink-0 flex-col gap-6 overflow-auto border-r border-border bg-card p-4">
            <Group title={t('rail.serverTitle')} caption={t('rail.serverCaption')}>
                <Field label={t('rail.level')}>
                    <select
                        value={server.level}
                        onChange={e => onServerAxis({ level: e.target.value })}
                        className={fieldClass}
                    >
                        {LEVELS.map(level => (
                            <option key={level} value={level}>
                                {level || t('rail.all')}
                            </option>
                        ))}
                    </select>
                </Field>
                {/* KST day boundaries, applied to `createdAt` — see the range caveat below. */}
                <Field label={t('rail.from')}>
                    <input
                        type="date"
                        value={server.from}
                        max={server.to || undefined}
                        onChange={e => onServerAxis({ from: e.target.value })}
                        className={fieldClass}
                    />
                </Field>
                <Field label={t('rail.to')}>
                    <input
                        type="date"
                        value={server.to}
                        min={server.from || undefined}
                        onChange={e => onServerAxis({ to: e.target.value })}
                        className={fieldClass}
                    />
                </Field>
                <p className={captionClass}>{t('rail.rangeCaveat')}</p>
            </Group>

            <Group
                title={t('rail.clientTitle')}
                action={
                    hasClientNarrowing ? (
                        <button
                            type="button"
                            onClick={onClearClient}
                            className="text-[11px] text-muted-foreground underline hover:text-foreground"
                        >
                            {t('rail.reset')}
                        </button>
                    ) : undefined
                }
            >
                <Field label={t('rail.search')}>
                    <input
                        type="text"
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        placeholder={t('rail.searchPlaceholder')}
                        className={fieldClass}
                    />
                </Field>
            </Group>

            <details open={advancedOpen} onToggle={e => setAdvancedOpen(e.currentTarget.open)}>
                <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-foreground">
                    {t('rail.advanced')}
                </summary>
                <div className="mt-2.5 flex flex-col gap-2.5">
                    {/* A server axis like the ones above; here because it is rarely changed. */}
                    <Field label={t('rail.kind')}>
                        <select
                            value={server.kind}
                            onChange={e => onServerAxis({ kind: e.target.value })}
                            className={fieldClass}
                        >
                            {KINDS.map(kind => (
                                <option key={kind.value} value={kind.value}>
                                    {t(`rail.kinds.${kind.key}`)}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <p className={captionClass}>
                        {t('rail.clientCaption', { n: formatNumber(corpusSize, lng) })} {t('rail.serverAxisCaveat')}
                    </p>
                    <Field label={t('rail.records')}>
                        <select
                            value={record}
                            onChange={e => onRecord(e.target.value as RecordFilter)}
                            className={fieldClass}
                        >
                            {RECORD_FILTERS.map(value => (
                                <option key={value} value={value}>
                                    {t(`rail.recordFilters.${value}`)}
                                </option>
                            ))}
                        </select>
                    </Field>
                    {CLIENT_FACETS.map(facet => {
                        const values = facets[facet.key];
                        const picked = selection[facet.key];
                        // A facet with nothing in it is noise; one with a single value is
                        // already the answer. Both are hidden so the rail shows only the axes
                        // that can actually narrow this corpus.
                        //
                        // Unless it is the one currently selected. A server-backed axis narrows the
                        // corpus to its own value, which leaves exactly one value in the counts — so
                        // hiding on `< 2` would take the control away the moment it was used and
                        // strand the operator inside a filter with no way back to `All`.
                        if (values.length < 2 && !picked) return null;
                        return (
                            <Field
                                key={facet.key}
                                label={t(facet.onServer ? 'rail.facetLabelServer' : 'rail.facetLabel', {
                                    label: t(`rail.facets.${facet.key}`),
                                    n: formatNumber(values.length, lng),
                                })}
                            >
                                <select
                                    value={selection[facet.key] ?? ''}
                                    onChange={e => onFacet(facet.key, e.target.value)}
                                    className={fieldClass}
                                >
                                    <option value="">{t('rail.all')}</option>
                                    {values.map(value => (
                                        <option key={value.value} value={value.value}>
                                            {value.value} ({formatNumber(value.count, lng)})
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        );
                    })}
                </div>
            </details>
        </aside>
    );
};
