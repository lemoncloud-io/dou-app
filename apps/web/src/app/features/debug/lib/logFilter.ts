import type { AppLogInfo, AppLogLevel } from '@chatic/bridge-messages';

export interface LogFilterOptions {
    levels: Set<AppLogLevel>;
    query: string;
    tags?: Set<string>;
}

interface QueryTerm {
    field: 'any' | 'tag';
    value: string;
    negated: boolean;
}

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

const haystackOf = (log: AppLogInfo): string => {
    const parts = [log.tag ?? '', log.message ?? '', log.level ?? ''];

    for (const value of [log.data, (log as { error?: unknown }).error]) {
        if (value === undefined || value === null) continue;
        parts.push(typeof value === 'string' ? value : safeStringify(value));
    }

    return parts.join(' ').toLowerCase();
};

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
