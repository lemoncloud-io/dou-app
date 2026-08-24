import type { LogEntry, LogSource } from '@chatic/bridges';
import type { AppLogInfo } from '@chatic/app-messages';
import { appBridge } from './appBridge';

// The native core buffer is capped at 500 — this always fetches everything,
// so the tail slice happens web-side after normalization.
const FETCH_ALL_COUNT = 1_000;

/** Normalizes a bridge AppLogInfo record (all-optional fields) into a LogEntry. */
export const toLogEntry = (info: AppLogInfo): LogEntry => ({
    // id and occurrence-time context are carried straight through: the upload
    // queue dedups on the id, and the context must stay the one captured when
    // the entry was written, not whatever is current now.
    ...(info.id !== undefined ? { id: info.id } : {}),
    ...(info.runId !== undefined ? { runId: info.runId } : {}),
    ...(info.sid !== undefined ? { sid: info.sid } : {}),
    ...(info.uid !== undefined ? { uid: info.uid } : {}),
    ...(info.cid !== undefined ? { cid: info.cid } : {}),
    ...(info.appVersion !== undefined ? { appVersion: info.appVersion } : {}),
    ...(info.webVersion !== undefined ? { webVersion: info.webVersion } : {}),
    ...(info.route !== undefined ? { route: info.route } : {}),
    ...(info.os !== undefined ? { os: info.os } : {}),
    ...(info.osVersion !== undefined ? { osVersion: info.osVersion } : {}),
    ...(info.model !== undefined ? { model: info.model } : {}),
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
