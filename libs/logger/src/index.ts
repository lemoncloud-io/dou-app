/**
 * `@chatic/logger` — the platform-neutral logging core.
 *
 * The package is laid out by concern, and every module owns one:
 *
 * - `core/`          — the contract (`LogEntry`) and the engine: hub, buffers, logger, id
 * - `sinks/`         — destinations a hub subscriber can be built from
 * - `redaction/`     — what counts as a secret, and how it is masked
 * - `serialization/` — turning entries into report / wire payloads
 * - `persistence/`   — the storage port and the binder that keeps it in step
 * - `upload/`        — the server-bound queue, its source port and the send schedule
 * - `runtime.ts`     — the one composition root: the process-wide singleton
 *
 * Stateful collaborators are classes (`LogHub`, `LogBuffer`, `CoreLogger`,
 * `LogUploadQueue`, `LogUploadScheduler`, …) and take their dependencies as
 * constructor arguments, so any of them can be instantiated standalone. Ports
 * that platform layers implement (`LogPersistence`, `LogUploadSource`) stay
 * interfaces. Stateless policy (redaction, serialization) stays as functions.
 */

export * from './core';
export * from './sinks';
export * from './redaction';
export * from './serialization';
export * from './persistence';
export * from './upload';
export * from './runtime';
