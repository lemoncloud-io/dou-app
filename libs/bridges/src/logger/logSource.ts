import { logBuffer, logger } from '@chatic/logger';
import type { LogEntry, LogSource } from '@chatic/logger';

/**
 * Breadcrumb routing for reports (ADR-0047): the merged buffer of the
 * OUTERMOST shell is the source of truth — the native buffer in hybrid runs,
 * the local web buffer standalone. web-core only knows the `LogSource`
 * abstraction; apps/web swaps in the bridge-backed source at boot.
 */

/** Bridge round-trip cap so a dead native side cannot stall reporting. */
export const BREADCRUMB_TIMEOUT_MS = 1_500;

/** Local web buffer tail — the standalone source and the hybrid fallback. */
export const webBufferLogSource: LogSource = {
    tail: async (count: number): Promise<LogEntry[]> => logBuffer.peek().slice(-count),
};

let activeLogSource: LogSource = webBufferLogSource;

/**
 * Swaps the report breadcrumb source. apps/web calls this at boot when
 * running inside the native WebView (FetchAppLogBuffer-backed source);
 * standalone web keeps the local default.
 */
export const setReportLogSource = (source: LogSource): void => {
    activeLogSource = source;
};

/** The currently active breadcrumb source (issue reports use it directly). */
export const getReportLogSource = (): LogSource => activeLogSource;

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
    new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`LogSource timeout after ${ms}ms`)), ms);
        promise.then(
            value => {
                clearTimeout(timer);
                resolve(value);
            },
            reason => {
                clearTimeout(timer);
                reject(reason);
            }
        );
    });

/**
 * Assembles report breadcrumbs from the active LogSource.
 *
 * - `errorAt` filter: the source fetch is async (bridge round-trip), so
 *   entries logged AFTER the error would otherwise leak in — possible only
 *   because every entry keeps its occurrence timestamp (ADR-0047). Extra
 *   headroom is requested so the filter can still fill `count`.
 * - `fallback` is the synchronous local-buffer snapshot taken at error time;
 *   used when the source fails or times out.
 */
export const collectBreadcrumbs = async (
    count: number,
    fallback: LogEntry[],
    errorAt?: number
): Promise<LogEntry[]> => {
    const HEADROOM = 20;
    try {
        const entries = await withTimeout(activeLogSource.tail(count + HEADROOM), BREADCRUMB_TIMEOUT_MS);
        const filtered = errorAt === undefined ? entries : entries.filter(entry => entry.timestamp <= errorAt);
        return filtered.slice(-count);
    } catch (sourceError) {
        logger.warn('ERROR_REPORT', '[ErrorReport] LogSource failed — falling back to local snapshot', {
            error: sourceError instanceof Error ? sourceError.message : String(sourceError),
        });
        return fallback.slice(-count);
    }
};
