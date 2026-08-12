import type { LogEntry, LogSource } from '@chatic/bridges';
import type { AppLogInfo } from '@chatic/app-messages';
import { appBridge } from './appBridge';

// The native core buffer is capped at 500 — this always fetches everything,
// so the tail slice happens web-side after normalization.
const FETCH_ALL_COUNT = 1_000;

/** Normalizes a bridge AppLogInfo record (all-optional fields) into a LogEntry. */
export const toLogEntry = (info: AppLogInfo): LogEntry => ({
    level: info.level ?? 'info',
    tag: info.tag ?? 'APP',
    message: info.message ?? '',
    timestamp: info.timestamp ?? 0,
    ...(info.data !== undefined ? { data: info.data } : {}),
    ...(info.error !== undefined ? { error: info.error } : {}),
    ...(info.source !== undefined ? { source: info.source } : {}),
});

/**
 * Report breadcrumb source backed by the native merged buffer (native+web
 * entries with original tags/timestamps — ADR-0047). Wired via
 * `setReportLogSource` at boot when running inside the WebView; failures
 * propagate so `collectBreadcrumbs` falls back to the local web snapshot.
 */
export const nativeMergedLogSource: LogSource = {
    tail: async (count: number): Promise<LogEntry[]> => {
        const response = await appBridge.fetchAppLogBuffer(`log-source-${Date.now()}`, FETCH_ALL_COUNT);
        if (!response.success || !response.data) {
            throw new Error('FetchAppLogBuffer failed');
        }
        return (response.data.logs ?? []).map(toLogEntry).slice(-count);
    },
};
