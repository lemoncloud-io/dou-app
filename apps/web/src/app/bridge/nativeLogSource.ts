import type { LogEntry } from '@chatic/bridges';
import type { AppLogInfo } from '@chatic/app-messages';

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
