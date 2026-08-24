import type { AppLogInfo } from '@chatic/app-messages';
import type { LogEntry } from '@chatic/logger';

import { safeSerializable } from './utils/safeSerializable';

/**
 * Maps a core `LogEntry` onto the bridge's `AppLogInfo` shape.
 *
 * Shared by both web→native log paths — the per-entry `SendLog` relay and the
 * batched `SendLogBatch` charge (ADR-0063) — so a relayed entry looks the same
 * whichever one carried it. Two copies of this mapping would drift, and the
 * difference would show up as breadcrumbs that render differently depending on
 * which app build received them.
 *
 * `safeSerializable`, not `toWireLogEntry`, is deliberate. The wire mapper
 * flattens `data`/`error` into truncated strings because that is what the
 * server stores; these entries are also going into the native merged buffer,
 * which is the breadcrumb source in a hybrid run and wants the structure kept.
 * Masking still happens — at the boundaries that persist or transmit (the MMKV
 * adapters' `serializeLogs`, and `toWireLogEntry` on the way to the server).
 */
export const toAppLogInfo = (entry: LogEntry): AppLogInfo => ({
    id: entry.id,
    runId: entry.runId,
    sid: entry.sid,
    uid: entry.uid,
    cid: entry.cid,
    appVersion: entry.appVersion,
    webVersion: entry.webVersion,
    route: entry.route,
    os: entry.os,
    osVersion: entry.osVersion,
    model: entry.model,
    level: entry.level,
    tag: entry.tag,
    message: entry.message,
    data: safeSerializable(entry.data),
    error: safeSerializable(entry.error),
    timestamp: entry.timestamp,
    source: 'web',
});
