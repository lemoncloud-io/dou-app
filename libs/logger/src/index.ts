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
 * - `perf/`          — the performance budget and the metric entries that measure it
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
 *
 * `perf/` is the one deliberate exception to that split: it keeps process-wide
 * state (whether this run is sampled, and how many entries backpressure has
 * eaten) in module variables rather than a class. Its callers are instrumentation
 * points buried in unrelated code — a site switch, a web-vitals callback — which
 * cannot be handed an instance without threading one through every layer above
 * them. A class would therefore still need a singleton holder, so the holder is
 * all there is. It holds a counter and a `Logger` reference, never entries, so
 * "exactly one store" above still stands.
 */

export * from './core';
export * from './sinks';
export * from './redaction';
export * from './serialization';
export * from './upload';
export * from './perf';
export * from './runtime';
