/**
 * `lib/report-logs/logFacets.ts`
 * - Counts the distinct values of each client-side axis across the collected corpus.
 *
 * This exists because the backend's aggregation is hardwired: `buildQuery` always
 * aggregates on `stereo` and takes no parameter for anything else (chatic-backend-api
 * `abstract-services.ts`). So there is no server-side "count by tag" or "count by app
 * version" to ask for, and the axes those questions need are not even filterable — they
 * live inside the record's `meta`.
 *
 * The counts are therefore corpus-scoped, and the UI must say so. That is not a
 * shortcoming to paper over: it is the honest reach of what the console can compute
 * without a backend change (ADR-0083).
 */
import type { ReportLogRow } from './parseReportLog';

/** One value of an axis, with how often it occurs in the corpus. */
export interface FacetValue {
    value: string;
    count: number;
}

/**
 * Axes offered as facets. `level` is also a server filter; the rest are corpus-only.
 *
 * Note `app`/`env` only ever exist on report rows and `tag`/`source`/`os` only on batch
 * log rows — the two record shapes carry different context. `matchesFacets` excludes a
 * row that lacks the selected axis, so offering an axis no row in view can satisfy empties
 * the list; the rail hides a facet with fewer than two values, which is what keeps that
 * from happening in practice.
 */
export const FACET_KEYS = ['level', 'tag', 'app', 'env', 'appVersion', 'webVersion', 'route', 'source', 'os'] as const;

export type FacetKey = (typeof FACET_KEYS)[number];

export type Facets = Record<FacetKey, FacetValue[]>;

/**
 * Count each axis's values, most frequent first, ties broken alphabetically so the list
 * does not reshuffle as pages arrive.
 *
 * Rows missing an axis are skipped rather than counted under a placeholder — a facet is
 * for narrowing, and "no tag" is not a narrowing anyone asks for. The row count already
 * tells you how many are unaccounted for.
 */
export const buildFacets = (rows: ReportLogRow[]): Facets => {
    const counters: Record<FacetKey, Map<string, number>> = {
        level: new Map(),
        tag: new Map(),
        app: new Map(),
        env: new Map(),
        appVersion: new Map(),
        webVersion: new Map(),
        route: new Map(),
        source: new Map(),
        os: new Map(),
    };

    for (const row of rows) {
        for (const key of FACET_KEYS) {
            const value = row[key];
            if (typeof value !== 'string' || !value) continue;
            const counter = counters[key];
            counter.set(value, (counter.get(value) ?? 0) + 1);
        }
    }

    return FACET_KEYS.reduce((acc, key) => {
        acc[key] = Array.from(counters[key], ([value, count]) => ({ value, count })).sort(
            (a, b) => b.count - a.count || a.value.localeCompare(b.value)
        );
        return acc;
    }, {} as Facets);
};

/** Selected facet values, by axis. An absent or empty entry means "no filter on this axis". */
export type FacetSelection = Partial<Record<FacetKey, string>>;

/** True when the row matches every selected facet value. */
export const matchesFacets = (row: ReportLogRow, selection: FacetSelection): boolean =>
    FACET_KEYS.every(key => {
        const wanted = selection[key];
        return !wanted || row[key] === wanted;
    });

/**
 * Fields a free-text query is matched against.
 *
 * Cached per row: rows are immutable once parsed, the haystack includes full stack traces
 * from `message`, and this runs over the whole corpus on every keystroke. A `WeakMap`
 * keeps the cache tied to row lifetime, so a discarded corpus takes its entries with it.
 */
const haystacks = new WeakMap<ReportLogRow, string>();

const searchableOf = (row: ReportLogRow): string => {
    const cached = haystacks.get(row);
    if (cached !== undefined) return cached;
    const built = [
        row.title,
        row.message,
        row.userName,
        row.userId,
        row.cid,
        row.sid,
        row.runId,
        row.app,
        row.env,
        row.type,
        row.category,
        row.tag,
        row.level,
        row.source,
        row.route,
        row.os,
        row.appVersion,
        row.webVersion,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    haystacks.set(row, built);
    return built;
};

/**
 * Free-text match over the corpus. Every whitespace-separated term must appear somewhere
 * in the row (AND, not phrase): an operator typing `error 1000123` means both, and
 * requiring the exact adjacency would find nothing.
 */
export const matchesQuery = (row: ReportLogRow, query: string): boolean => makeQueryMatcher(query)(row);

/**
 * Split the query once, then test many rows.
 *
 * `matchesQuery` re-parses the query per row, which is fine for a handful and wasteful
 * across a 5,000-row corpus. Callers filtering a whole corpus should build the matcher
 * once outside the loop.
 */
export const makeQueryMatcher = (query: string): ((row: ReportLogRow) => boolean) => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return () => true;
    return row => {
        const haystack = searchableOf(row);
        return terms.every(term => haystack.includes(term));
    };
};
