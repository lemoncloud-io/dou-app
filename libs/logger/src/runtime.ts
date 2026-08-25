import { CoreLogger } from './core/CoreLogger';
import { LogHub } from './core/LogHub';

import type { LogContextProvider, LogEntry, Logger } from './core/types';

/**
 * The process-wide logging singleton — the one composition root of this
 * package.
 *
 * Every class under `core/` takes its collaborators as arguments so it can be
 * instantiated in isolation; this module is where exactly one of each is built
 * and wired together. Nothing else in the package reaches for a singleton,
 * which is why the module graph stays acyclic: everything points inward.
 */

const hub = new LogHub();
const core = new CoreLogger({ hub });

/**
 * Shared pub/sub hub for log entries. Sinks (console mirror, Crashlytics, the
 * unsent queue) subscribe here; `logger` publishes.
 *
 * This is the only way to observe a log entry — the console included. The
 * package used to keep a ring buffer that every entry was pushed into regardless
 * of subscribers, and a console fallback that fired whenever the hub had none;
 * both are gone. Anything that needs to see logs subscribes, and has to be
 * subscribed before the entries it cares about are dispatched (principle 15).
 */
export const logHub: LogHub = hub;

/**
 * App-wide logger facade. Publishes every entry to `logHub`;
 * environment-specific sinks are attached by the host app
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
