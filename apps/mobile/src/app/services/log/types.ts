import type { Logger, LogListener } from '@chatic/logger';

export type { LogEntry, LogLevel, LogListener, LogOrigin } from '@chatic/logger';

/**
 * Tags and their open contract now live in the shared core (`@chatic/logger`) — this file used to
 * keep its own `LOG_TAGS` array, which meant the catalog had two partial copies and the web had
 * none. Re-exported here so existing `services/log` importers keep working.
 */
export { KNOWN_LOG_TAGS, isKnownLogTag } from '@chatic/logger';
export type { KnownLogTag, LogTag, ObservationKind } from '@chatic/logger';

/**
 * Mobile logging facade: the core Logger API plus hub subscription. Backed by
 * the shared `@chatic/logger` singleton, so native and (bridged) web entries
 * flow through one hub and one merged buffer (ADR-0097). Listeners receive a
 * `LogEntry` object — the positional-argument signature is gone.
 */
export interface ILogService extends Logger {
    subscribe(listener: LogListener): () => void;
}
