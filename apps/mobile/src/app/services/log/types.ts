import type { Logger, LogListener } from '@chatic/logger';

export type { LogEntry, LogLevel, LogListener, LogOrigin } from '@chatic/logger';

export { KNOWN_LOG_TAGS, isKnownLogTag } from '@chatic/logger';
export type { KnownLogTag, LogTag, ObservationKind } from '@chatic/logger';

export interface ILogService extends Logger {
    subscribe(listener: LogListener): () => void;
}
