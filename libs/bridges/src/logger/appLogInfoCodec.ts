import { pickLogContext, safeSerializable } from '@chatic/logger';

import type { AppLogInfo, AppLogStructuredFields } from '@chatic/app-messages';
import type { LogContext, LogEntry } from '@chatic/logger';

/**
 * The occurrence-time context tuple as `AppLogInfo` carries it.
 *
 * Not decoration — this is the agreement check. `Pick` fails to compile the
 * moment `AppLogInfo` stops declaring one of `LogContext`'s fields, which is the
 * only way to catch it here: `libs/app-messages` is a leaf (it imports no other
 * workspace package, because the installed native app compiles against it), so
 * it cannot derive its shape from `LogContext`. This file is where both types
 * are in scope, so this is where they get held together.
 *
 * Exported rather than local because it has to be: `noUnusedLocals` would
 * reject an assertion nothing reads, and the name is worth having anyway.
 */
export type AppLogInfoLogContext = Pick<AppLogInfo, keyof LogContext>;

/**
 * Maps a core `LogEntry` onto the bridge's `AppLogInfo` shape.
 *
 * Shared by both web→native log paths — the per-entry `SendLog` relay and the
 * the app's own store — so a relayed entry looks the same
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
/**
 * The structured fields both directions copy, typed against both sides: `satisfies` fails to compile
 * if a key here is not on `AppLogInfo`, and the `LogEntry` reads below fail if it is not on the entry.
 */
const STRUCTURED_FIELDS = [
    'kind',
    'httpStatus',
    'errorCode',
    'durationMs',
    'attrs',
    'metrics',
    'sr',
    'pv',
    'seq',
] as const satisfies readonly (keyof AppLogStructuredFields & keyof LogEntry)[];

/**
 * Copies the structured fields that are set, and nothing else.
 *
 * They cross as they are — numbers stay numbers, `attrs`/`metrics` stay objects — because a statistic
 * that lost its `kind` here would arrive in the app's store as a plain log: counted in the log share,
 * past the sampling verdict, with its numbers gone. The shapes are checked again by the wire mapper
 * on the way to the server.
 */
const KNOWN_KINDS: readonly unknown[] = ['log', 'trace', 'sample', 'event'];

const pickStructured = (
    source: Partial<Record<(typeof STRUCTURED_FIELDS)[number], unknown>>
): AppLogStructuredFields => {
    const picked: Record<string, unknown> = {};
    for (const field of STRUCTURED_FIELDS) {
        if (source[field] !== undefined) picked[field] = source[field];
    }
    // A kind this build does not know (a newer peer's, or junk) is dropped, which makes the entry a
    // log: carried on as an unknown statistic it would be judged and uploaded under a kind the
    // server may refuse, taking the logs in the same batch with it.
    if (picked.kind !== undefined && !KNOWN_KINDS.includes(picked.kind)) delete picked.kind;
    return picked as AppLogStructuredFields;
};

export const toAppLogInfo = (entry: LogEntry): AppLogInfo => ({
    ...pickLogContext(entry),
    ...pickStructured(entry),
    id: entry.id,
    level: entry.level,
    tag: entry.tag,
    message: entry.message,
    data: safeSerializable(entry.data),
    error: safeSerializable(entry.error),
    timestamp: entry.timestamp,
    source: 'web',
});

/**
 * Normalizes a bridge `AppLogInfo` record (all-optional fields) back into a
 * `LogEntry` — the inverse of `toAppLogInfo`, and deliberately its neighbour.
 *
 * The two used to live in different packages (this one in `apps/web`), which
 * meant the context tuple was listed once per direction and kept in step by
 * hand. Nothing failed when they disagreed: the field just disappeared at
 * whichever hop had forgotten it. Now both copy the tuple from the same
 * `pickLogContext`, and the round-trip spec next door walks
 * `LOG_CONTEXT_FIELDS`, so a field added to `LogContext` is covered without
 * anyone remembering to extend a fixture.
 *
 * `id` and the context are carried straight through: the upload queue dedups on
 * the id, and the context must stay the one captured when the entry was
 * written, not whatever is current now.
 */
export const toLogEntry = (info: AppLogInfo): LogEntry => ({
    ...pickLogContext(info),
    ...(pickStructured(info) as Partial<LogEntry>),
    ...(info.id !== undefined ? { id: info.id } : {}),
    level: info.level ?? 'info',
    tag: info.tag ?? 'APP',
    message: info.message ?? '',
    timestamp: info.timestamp ?? 0,
    ...(info.data !== undefined ? { data: info.data } : {}),
    ...(info.error !== undefined ? { error: info.error } : {}),
    ...(info.source !== undefined ? { source: info.source } : {}),
});
