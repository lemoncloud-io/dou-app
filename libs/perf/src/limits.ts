/**
 * Firebase Performance's per-trace limits, enforced once, before any backend sees a value.
 *
 * The React Native SDK throws on an out-of-limit attribute or metric name, and the native SDK
 * drops what gets past it — either way the trace ships without the value someone was counting
 * on. The log fallback has no such limits at all. Enforcing the stricter rule here is what makes a
 * trace carry the same fields whichever backend it ends up on.
 */

/** Custom attributes per trace. A sixth is dropped by the SDK. */
export const MAX_PERF_ATTRIBUTES = 5;

const MAX_ATTRIBUTE_VALUE_LENGTH = 100;

/** A letter, then letters/digits/underscores; 40 characters at most. */
const ATTRIBUTE_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

/** The SDK reserves these prefixes for its own attributes. */
const RESERVED_ATTRIBUTE_PREFIXES = ['firebase_', 'google_', 'ga_'];

/** Same shape as an attribute key, with the SDK's longer 100-character cap. */
const METRIC_NAME = /^[A-Za-z][A-Za-z0-9_]{0,99}$/;

export const isValidPerfAttributeKey = (key: string): boolean =>
    ATTRIBUTE_KEY.test(key) && !RESERVED_ATTRIBUTE_PREFIXES.some(prefix => key.startsWith(prefix));

export const isValidPerfMetricName = (name: string): boolean => METRIC_NAME.test(name);

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
