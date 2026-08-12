import type { Logger, LogListener } from '@chatic/logger';

export type { LogEntry, LogLevel, LogListener, LogOrigin } from '@chatic/logger';

/**
 * Open tag contract (ADR-0047): tags are plain strings shared with the web
 * pipeline so entries keep their original tag across the bridge. Well-known
 * native tags live in LOG_TAGS below purely as shared constants — the closed
 * union this used to be is gone.
 */
export type LogTag = string;

/** Well-known native log tags (informational — the contract stays open). */
export const LOG_TAGS = [
    'APP',
    'SMS',
    'NOTIFICATION',
    'FIREBASE',
    'IAP',
    'BRIDGE',
    'NETWORK',
    'WEBVIEW',
    'GLOBAL',
    'STORAGE',
    'CACHE',
    'CLIPBOARD',
    'PERMISSION',
    'DEVICE',
    'DEEPLINK',
    'OAUTH',
    'SQLITE',
    'LOG_BUFFER',
    'APP_ICON',
    'TEST',
    'UPLOAD',
    'PREFERENCE',
    'PUSH_QUEUE',
    'PUSH_EVENT',
    'PERF',
    'VERSION',
    'UNFURL',
] as const;

/**
 * Mobile logging facade: the core Logger API plus hub subscription. Backed by
 * the shared `@chatic/logger` singleton, so native and (bridged) web entries
 * flow through one hub and one merged buffer (ADR-0047). Listeners receive a
 * `LogEntry` object — the positional-argument signature is gone.
 */
export interface ILogService extends Logger {
    subscribe(listener: LogListener): () => void;
}
