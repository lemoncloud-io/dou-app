import type { ReportLogRow } from './parseReportLog';

export interface FacetValue {
    value: string;
    count: number;
}

export const FACET_KEYS = [
    'level',
    'area',
    'tag',
    'app',
    'env',
    'appVersion',
    'webVersion',
    'route',
    'source',
    'os',
    'osVersion',
    'model',
] as const;

export type FacetKey = (typeof FACET_KEYS)[number];

export type Facets = Record<FacetKey, FacetValue[]>;

export const buildFacets = (rows: ReportLogRow[]): Facets => {
    const counters = FACET_KEYS.reduce(
        (acc, key) => {
            acc[key] = new Map<string, number>();
            return acc;
        },
        {} as Record<FacetKey, Map<string, number>>
    );

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

export type FacetSelection = Partial<Record<FacetKey, string>>;

export const matchesFacets = (row: ReportLogRow, selection: FacetSelection): boolean =>
    FACET_KEYS.every(key => {
        const wanted = selection[key];
        return !wanted || row[key] === wanted;
    });

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
        row.area,
        row.level,
        row.source,
        row.route,
        row.os,
        row.osVersion,
        row.model,
        row.appVersion,
        row.webVersion,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    haystacks.set(row, built);
    return built;
};

export const matchesQuery = (row: ReportLogRow, query: string): boolean => makeQueryMatcher(query)(row);

export const makeQueryMatcher = (query: string): ((row: ReportLogRow) => boolean) => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return () => true;
    return row => {
        const haystack = searchableOf(row);
        return terms.every(term => haystack.includes(term));
    };
};
