import type { AppLogInfo, AppLogLevel } from '@chatic/app-messages';

export interface LogFilterOptions {
    /** Levels to keep. An empty set means "all levels". */
    levels: Set<AppLogLevel>;
    /** Query expression — see `parseLogQuery`. Empty = no search. */
    query: string;
    /** Tags to keep. An empty set means "all tags". */
    tags?: Set<string>;
}

/** One clause of a parsed query. */
interface QueryTerm {
    /** `tag:` restricts to the tag field; otherwise the whole entry is searched. */
    field: 'any' | 'tag';
    value: string;
    /** Prefixed with `-`: the entry must NOT match. */
    negated: boolean;
}

/**
 * Splits a query into terms, respecting double quotes.
 *
 * Quoting exists because log messages are sentences. `"failed to fetch"` has to
 * be findable as a phrase; without quotes those are three separate requirements
 * that also match an unrelated line containing all three words apart.
 */
const tokenize = (query: string): string[] => {
    const tokens: string[] = [];
    let current = '';
    let quoted = false;

    for (const char of query) {
        if (char === '"') {
            quoted = !quoted;
            continue;
        }
        if (!quoted && /\s/.test(char)) {
            if (current) tokens.push(current);
            current = '';
            continue;
        }
        current += char;
    }
    if (current) tokens.push(current);

    return tokens;
};

/**
 * Parses the query box into terms.
 *
 * The grammar is deliberately the one people already type into search boxes,
 * rather than anything to learn:
 *
 * - `socket failed`  — both must appear (AND, not OR: narrowing is the point)
 * - `-heartbeat`     — exclude. The single most useful control when one noisy
 *                      line is burying everything else
 * - `tag:NET`        — restrict to a tag
 * - `"not found"`    — phrase
 *
 * Anything that does not parse is treated as plain text, so a stray `:` or `-`
 * never makes the box refuse to search.
 */
export const parseLogQuery = (query: string): QueryTerm[] =>
    tokenize(query)
        .map(token => {
            const negated = token.startsWith('-') && token.length > 1;
            const body = negated ? token.slice(1) : token;
            const tagPrefix = 'tag:';

            if (body.toLowerCase().startsWith(tagPrefix) && body.length > tagPrefix.length) {
                return { field: 'tag' as const, value: body.slice(tagPrefix.length).toLowerCase(), negated };
            }
            return { field: 'any' as const, value: body.toLowerCase(), negated };
        })
        .filter(term => term.value.length > 0);

/**
 * Everything about an entry that a search should reach.
 *
 * `data` and `error` are included, and that is the point: the message is
 * usually the generic half ("request failed") while the identifying half — a
 * status code, an id, a url — is in the payload. Searching only tag and message
 * meant the thing you actually knew about the bug was unsearchable.
 */
const haystackOf = (log: AppLogInfo): string => {
    const parts = [log.tag ?? '', log.message ?? '', log.level ?? ''];

    for (const value of [log.data, (log as { error?: unknown }).error]) {
        if (value === undefined || value === null) continue;
        parts.push(typeof value === 'string' ? value : safeStringify(value));
    }

    return parts.join(' ').toLowerCase();
};

/** Best-effort stringify — a value that cannot be serialized simply is not searchable. */
const safeStringify = (value: unknown): string => {
    try {
        return JSON.stringify(value) ?? '';
    } catch {
        return '';
    }
};

const matches = (log: AppLogInfo, term: QueryTerm): boolean => {
    const hit =
        term.field === 'tag'
            ? (log.tag ?? '').toLowerCase().includes(term.value)
            : haystackOf(log).includes(term.value);

    return term.negated ? !hit : hit;
};

/**
 * Filters logs by level, tag and query, then sorts newest-first.
 *
 * The store keeps entries oldest→newest; a log viewer wants the reverse. Ties
 * (same or missing timestamp — common within a burst) fall back to original
 * insertion order reversed, so later-inserted entries stay on top.
 */
export const filterLogs = (logs: AppLogInfo[], { levels, query, tags }: LogFilterOptions): AppLogInfo[] => {
    const terms = parseLogQuery(query);

    const matched = logs
        .map((log, index) => ({ log, index }))
        .filter(({ log }) => {
            if (levels.size > 0 && !levels.has((log.level ?? 'unknown') as AppLogLevel)) return false;
            if (tags && tags.size > 0 && !tags.has(log.tag ?? '')) return false;

            return terms.every(term => matches(log, term));
        });

    return matched
        .sort((a, b) => (b.log.timestamp ?? 0) - (a.log.timestamp ?? 0) || b.index - a.index)
        .map(({ log }) => log);
};

/**
 * Tags present in the given logs, most frequent first.
 *
 * Derived from what is actually there rather than from the `LOG_TAGS` constant:
 * a picker listing thirty tags of which two occurred is a worse picker, and in
 * a floating panel there is no room for it.
 */
export const collectLogTags = (logs: AppLogInfo[]): { tag: string; count: number }[] => {
    const counts = new Map<string, number>();

    for (const log of logs) {
        const tag = log.tag ?? '';
        if (!tag) continue;
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }

    return [...counts.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
};
