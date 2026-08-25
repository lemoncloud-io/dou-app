/**
 * `@chatic/logger` — the platform-neutral logging core.
 *
 * The package is laid out by concern, and every module owns one:
 *
 * - `core/`          — the contract (`LogEntry`) and the engine: hub, logger, id
 * - `sinks/`         — destinations a hub subscriber can be built from
 * - `redaction/`     — what counts as a secret, and how it is masked
 * - `serialization/` — turning entries into report / wire payloads
 * - `upload/`        — the server-bound queue, its source port and the send schedule
 * - `runtime.ts`     — the one composition root: the process-wide singleton
 *
 * There is exactly one store: the unsent upload queue. The package used to keep
 * a second one — a ring buffer for diagnostics, with its own persistence port —
 * on the grounds that the two had different lifetimes. Making sending pausable
 * collapsed that difference, so the queue serves both readers and the buffer is
 * gone (principle 10).
 *
 * Stateful collaborators are classes (`LogHub`, `CoreLogger`, `LogUploadQueue`,
 * `LogUploadScheduler`, …) and take their dependencies as constructor
 * arguments, so any of them can be instantiated standalone. Ports that platform
 * layers implement (`LogStoreReader` / `LogStoreWriter`) stay interfaces. Stateless policy
 * (redaction, serialization) stays as functions.
 */

export * from './core';
export * from './sinks';
export * from './redaction';
export * from './serialization';
export * from './upload';
export * from './runtime';
