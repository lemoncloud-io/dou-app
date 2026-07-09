import type { AppLogInfo, AppLogLevel } from '@chatic/app-messages';

export interface LogFilterOptions {
    /** Levels to keep. An empty set means "all levels". */
    levels: Set<AppLogLevel>;
    /** Case-insensitive substring matched against tag + message. Empty = no search. */
    query: string;
}

/**
 * Filters logs by level and query, then sorts newest-first.
 *
 * The buffer stores entries oldest→newest; a log viewer wants the reverse.
 * Ties (same or missing timestamp — common within a burst) fall back to
 * original insertion order reversed, so later-inserted entries stay on top.
 */
export const filterLogs = (logs: AppLogInfo[], { levels, query }: LogFilterOptions): AppLogInfo[] => {
    const needle = query.trim().toLowerCase();

    const matched = logs
        .map((log, index) => ({ log, index }))
        .filter(({ log }) => {
            if (levels.size > 0 && !levels.has((log.level ?? 'unknown') as AppLogLevel)) return false;

            if (needle) {
                const haystack = `${log.tag ?? ''} ${log.message ?? ''}`.toLowerCase();
                if (!haystack.includes(needle)) return false;
            }

            return true;
        });

    return matched
        .sort((a, b) => (b.log.timestamp ?? 0) - (a.log.timestamp ?? 0) || b.index - a.index)
        .map(({ log }) => log);
};
