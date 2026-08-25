import type { LogContext } from './types';

/**
 * The occurrence-time context tuple, as data.
 *
 * `LogContext` documents these fields; this file makes the *list* of them
 * available at runtime so every mapper can copy the tuple instead of spelling
 * it out again. It was spelled out in five places (the wire type, the wire
 * mapper, `AppLogInfo`, and both directions of the bridge codec), and adding a
 * field meant editing all of them — with nothing failing if one was missed. The
 * field simply vanished at that hop.
 *
 * The map below is what makes this safe: `Record<keyof LogContext, true>` will
 * not compile if a field is missing from it, or if a field it lists is not on
 * `LogContext`. So the list cannot drift from the interface, and the interface
 * keeps its per-field documentation.
 */
const LOG_CONTEXT_FIELD_MAP: Record<keyof LogContext, true> = {
    runId: true,
    sid: true,
    uid: true,
    cid: true,
    appVersion: true,
    webVersion: true,
    route: true,
    os: true,
    osVersion: true,
    model: true,
};

/** Every `LogContext` field name, in declaration order. */
export const LOG_CONTEXT_FIELDS = Object.keys(LOG_CONTEXT_FIELD_MAP) as (keyof LogContext)[];

/**
 * Copies just the context tuple off anything carrying it, dropping fields that
 * are absent.
 *
 * Dropping rather than passing `undefined` through is what keeps a mapper's
 * output free of keys that were never set — a restored entry must not gain a
 * `route: undefined` it never had, and the bridge/wire payloads are compared
 * for equality in tests and stored as-is by the server.
 *
 * An allowlist, so it stays usable in the places whose whole job is to copy
 * only known fields: anything else on `source` is left behind.
 */
export const pickLogContext = (source: Partial<LogContext>): LogContext => {
    const picked: Record<string, string> = {};

    for (const field of LOG_CONTEXT_FIELDS) {
        const value = source[field];
        if (value !== undefined) picked[field] = value;
    }

    return picked as LogContext;
};
