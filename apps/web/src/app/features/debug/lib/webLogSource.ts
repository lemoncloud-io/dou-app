import { logBuffer } from '@chatic/bridges';
import type { AppLogInfo } from '@chatic/app-messages';

/**
 * Synchronous log source over the in-memory web log buffer. Response shapes
 * mirror the native log-buffer bridge payloads (OnFetchAppLogBuffer, ...) so
 * the debug UI can treat the web and app buffers identically.
 */
export const webLogSource = {
    /** Reads up to `count` oldest entries, keeping them in the buffer. */
    fetch: (count?: number): { logs: AppLogInfo[]; size: number } => ({
        logs: logBuffer.peek(count),
        size: logBuffer.size(),
    }),
    /** Removes and returns up to `count` oldest entries. */
    poll: (count?: number): { logs: AppLogInfo[]; size: number } => ({
        logs: logBuffer.poll(count),
        size: logBuffer.size(),
    }),
    clear: (): { success: boolean; size: number } => {
        logBuffer.clear();
        return { success: true, size: logBuffer.size() };
    },
    fetchSize: (): { size: number } => ({ size: logBuffer.size() }),
};
