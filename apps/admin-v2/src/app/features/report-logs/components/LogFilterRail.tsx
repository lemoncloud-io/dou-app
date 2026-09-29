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
 * The text field holds its own state and settles into the URL on a delay, matching
 * `MembershipsPage`. Without it every keystroke writes a URL and re-runs a filter plus a
 * sort over the whole corpus — up to 5,000 rows synchronously, per character.
 */
import { useEffect, useRef, useState } from 'react';

import { useDebounce } from '@chatic/shared';

import type { ReportKind, ReportStage } from '../api/reportLogApi';
import type { ServerAxes } from '../hooks/use-log-console-state';
import { SERVER_AXIS_CAVEAT } from '../api/reportLogApi';
import type { FacetKey, Facets } from '../lib/logFacets';
import type { FacetSelection } from '../lib/logFacets';

interface LogFilterRailProps {
    server: ServerAxes;
    onServerAxis: (patch: Partial<Record<keyof ServerAxes, string>>) => void;
    query: string;
    onQuery: (value: string) => void;
    facets: Facets;
    selection: FacetSelection;
    onFacet: (key: FacetKey, value: string) => void;
    onClearClient: () => void;
    /** Rows the client-side filters are working over, for the group's caption. */
    corpusSize: number;
}

const KINDS: Array<{ value: ReportKind; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'log-entry', label: 'Log' },
    { value: 'issue', label: 'Issue' },
    { value: 'error', label: 'Legacy error report' },
];

const LEVELS = [
    { value: '', label: 'All' },
    { value: 'error', label: 'error' },
    { value: 'warn', label: 'warn' },
    { value: 'info', label: 'info' },
    { value: 'debug', label: 'debug' },
];

/**
 * Facets worth a dropdown, in the order an operator reaches for them.
 *
 * The dropdown still lists what the CORPUS holds, with counts — that is the discoverability a
 * text input cannot give. What changed is where the selection lands: the axes marked `onServer`
 * were lifted to top-level fields by chatic-backend-api #41, so choosing one re-collects the
 * corpus narrowed on the server instead of only hiding rows already fetched.
 */
const CLIENT_FACETS: Array<{ key: FacetKey; label: string; onServer?: true }> = [
    { key: 'tag', label: 'Tag', onServer: true },
    { key: 'appVersion', label: 'App version', onServer: true },
    { key: 'webVersion', label: 'Web version', onServer: true },
    { key: 'route', label: 'Screen', onServer: true },
    { key: 'source', label: 'Source' },
    { key: 'app', label: 'App' },
    { key: 'env', label: 'Env' },
    { key: 'os', label: 'OS', onServer: true },
    { key: 'osVersion', label: 'OS version', onServer: true },
    { key: 'model', label: 'Device', onServer: true },
];

const fieldClass =
    'w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring';

const Group = ({
    title,
    caption,
    children,
    action,
}: {
    title: string;
    caption: string;
    children: React.ReactNode;
    action?: React.ReactNode;
}) => (
    <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground">{title}</h2>
            {action}
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">{caption}</p>
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
    corpusSize,
}: LogFilterRailProps) => {
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

    const hasClientNarrowing = !!query || Object.values(selection).some(Boolean);

    return (
        <aside className="flex w-64 shrink-0 flex-col gap-6 overflow-auto border-r border-border bg-card p-4">
            <Group
                title="Query conditions"
                caption="Applied server-side across the full dataset. Changing one restarts the collection."
            >
                <Field label="Stage">
                    <select
                        value={server.stage}
                        onChange={e => onServerAxis({ stage: e.target.value as ReportStage })}
                        className={fieldClass}
                    >
                        <option value="v1">prod (v1)</option>
                        <option value="d1">dev (d1)</option>
                    </select>
                </Field>
                <Field label="Kind">
                    <select
                        value={server.kind}
                        onChange={e => onServerAxis({ kind: e.target.value })}
                        className={fieldClass}
                    >
                        {KINDS.map(kind => (
                            <option key={kind.value} value={kind.value}>
                                {kind.label}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Level">
                    <select
                        value={server.level}
                        onChange={e => onServerAxis({ level: e.target.value })}
                        className={fieldClass}
                    >
                        {LEVELS.map(level => (
                            <option key={level.value} value={level.value}>
                                {level.label}
                            </option>
                        ))}
                    </select>
                </Field>
                {/* KST day boundaries, applied to `createdAt` — see the range caveat below. */}
                <Field label="From date (KST)">
                    <input
                        type="date"
                        value={server.from}
                        max={server.to || undefined}
                        onChange={e => onServerAxis({ from: e.target.value })}
                        className={fieldClass}
                    />
                </Field>
                <Field label="To date (KST)">
                    <input
                        type="date"
                        value={server.to}
                        min={server.from || undefined}
                        onChange={e => onServerAxis({ to: e.target.value })}
                        className={fieldClass}
                    />
                </Field>
                <p className="text-[11px] leading-snug text-muted-foreground">
                    The range is matched against server <span className="font-mono">arrival</span> time. The screen's
                    times and order use <span className="font-mono">occurrence</span> time, so rows near the boundary
                    can be off by a day.
                </p>
            </Group>

            <Group
                title="Collected-set filters"
                caption={`Values and counts are over the ${corpusSize.toLocaleString()} collected rows. ${SERVER_AXIS_CAVEAT}`}
                action={
                    hasClientNarrowing ? (
                        <button
                            type="button"
                            onClick={onClearClient}
                            className="text-[11px] text-muted-foreground underline hover:text-foreground"
                        >
                            Reset
                        </button>
                    ) : undefined
                }
            >
                <Field label="Search">
                    <input
                        type="text"
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        placeholder="Message, user, tag…"
                        className={fieldClass}
                    />
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
                            label={`${facet.label} (${values.length})${facet.onServer ? ' · server' : ''}`}
                        >
                            <select
                                value={selection[facet.key] ?? ''}
                                onChange={e => onFacet(facet.key, e.target.value)}
                                className={fieldClass}
                            >
                                <option value="">All</option>
                                {values.map(value => (
                                    <option key={value.value} value={value.value}>
                                        {value.value} ({value.count.toLocaleString()})
                                    </option>
                                ))}
                            </select>
                        </Field>
                    );
                })}
            </Group>
        </aside>
    );
};
