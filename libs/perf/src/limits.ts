/**
 * The per-trace limits, enforced once, before any backend sees a value.
 *
 * The shapes are Firebase Performance's: the React Native SDK throws on an out-of-limit attribute
 * or metric name, and the native SDK drops what gets past it. Enforcing the stricter shape here is
 * what makes a trace carry well-formed fields whichever backend it ends up on.
 *
 * The **counts** are the log pipeline's, which is wider than Firebase: 16 attributes, 32 metrics.
 * Firebase's cap of five attributes is applied by its own backend instead, from the per-trace list
 * in `catalog.ts` — a trace can carry dimensions the pipeline aggregates on without one of them
 * pushing a dimension Firebase already reports off the trace.
 */

/** Attributes per trace. Firebase receives at most five of them — see `firebaseResultOf` in `catalog.ts`. */
export const MAX_PERF_ATTRIBUTES = 16;

/** Metrics per trace — Firebase's own limit, and the log pipeline's. */
export const MAX_PERF_METRICS = 32;

const MAX_ATTRIBUTE_VALUE_LENGTH = 100;

/** A letter, then letters/digits/underscores; 40 characters at most. */
const ATTRIBUTE_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

/** The SDK reserves these prefixes for its own attributes. */
const RESERVED_ATTRIBUTE_PREFIXES = ['firebase_', 'google_', 'ga_'];

/** Same shape as an attribute key, with the SDK's longer 100-character cap. */
const METRIC_NAME = /^[A-Za-z][A-Za-z0-9_]{0,99}$/;

/** The same shape again for a trace name: no leading underscore (reserved), 100 characters. */
const TRACE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,99}$/;

export const isValidPerfAttributeKey = (key: string): boolean =>
    ATTRIBUTE_KEY.test(key) && !RESERVED_ATTRIBUTE_PREFIXES.some(prefix => key.startsWith(prefix));

export const isValidPerfMetricName = (name: string): boolean => METRIC_NAME.test(name);

/**
 * Whether a trace name that crossed the bridge as a plain string is one Firebase would accept.
 *
 * A shape check, not membership in `PerfTraceName`. The web deploys ahead of the app, so an app
 * build checking against its own copy of the list would silently drop every trace added after it
 * shipped. The sender is this repo's web either way; what the check stops is malformed input.
 */
export const isValidPerfTraceName = (name: string): boolean => TRACE_NAME.test(name);

/**
 * Trims and caps an attribute value, or returns `null` for one that is empty once trimmed.
 * Truncating instead of dropping keeps the dimension: a long value is still mostly the value.
 */
export const normalizePerfAttributeValue = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, MAX_ATTRIBUTE_VALUE_LENGTH);
};

/**
 * Rounds a metric to the integer Firebase stores, or returns `null` for a value that is not a
 * measurement. Sub-millisecond precision is noise at this scale anyway.
 */
export const normalizePerfMetricValue = (value: number): number | null =>
    Number.isFinite(value) ? Math.round(value) : null;
