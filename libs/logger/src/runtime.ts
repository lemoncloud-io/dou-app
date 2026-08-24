import { CoreLogger } from './core/CoreLogger';
import { LogBuffer } from './core/LogBuffer';
import { LogHub } from './core/LogHub';
import { ConsoleLogSink } from './sinks/ConsoleLogSink';

import type { LogContextProvider, LogEntry, Logger } from './core/types';

/**
 * The process-wide logging singleton — the one composition root of this
 * package.
 *
 * Every class under `core/` takes its collaborators as arguments so it can be
 * instantiated in isolation; this module is where exactly one of each is built
 * and wired together. Nothing else in the package reaches for a singleton,
 * which is why the module graph stays acyclic: everything points inward, and
 * only the outer wiring (persistence attachment) points back here.
 */

/** Number of entries retained in the in-memory log buffer. */
export const LOG_BUFFER_CAPACITY = 500;

const hub = new LogHub();
const buffer = new LogBuffer(LOG_BUFFER_CAPACITY);
const core = new CoreLogger({ hub, buffer, fallback: new ConsoleLogSink().toListener() });

/**
 * Shared pub/sub hub for log entries. Sinks (console mirror, native bridge
 * forwarder, remote shippers) subscribe here; `logger` publishes.
 */
export const logHub: LogHub = hub;

/**
 * In-memory view over the most recent log entries. Follows the mobile
 * LogBufferService semantics (peek keeps, poll consumes) so the debug UI can
 * use the same interaction model against either buffer.
 */
export const logBuffer: LogBuffer = buffer;

/**
 * App-wide logger facade. Publishes every entry to `logHub` and the built-in
 * ring buffer; environment-specific sinks are attached by the host app
 * (see `setupBridgeLogger` in `@chatic/bridges`).
 */
export const logger: Logger = core;

/**
 * Registers the source of occurrence-time context (runId, session, route,
 * device). The host app wires this at boot, before anything logs. Pass
 * `undefined` to detach.
 */
export const setLogContextProvider = (provider: LogContextProvider | undefined): void =>
    core.setContextProvider(provider);

/**
 * Ingests an entry stamped in another runtime (bridge relay, native emitter)
 * without restamping its timestamp or context. (ADR-0047)
 */
export const ingestLogEntry = (entry: LogEntry): void => core.ingest(entry);
