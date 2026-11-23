export const MAX_PERF_ATTRIBUTES = 16;

export const MAX_PERF_METRICS = 32;

const MAX_ATTRIBUTE_VALUE_LENGTH = 100;

const ATTRIBUTE_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

const RESERVED_ATTRIBUTE_PREFIXES = ['firebase_', 'google_', 'ga_'];

const METRIC_NAME = /^[A-Za-z][A-Za-z0-9_]{0,99}$/;

const TRACE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,99}$/;

export const isValidPerfAttributeKey = (key: string): boolean =>
    ATTRIBUTE_KEY.test(key) && !RESERVED_ATTRIBUTE_PREFIXES.some(prefix => key.startsWith(prefix));

export const isValidPerfMetricName = (name: string): boolean => METRIC_NAME.test(name);

export const isValidPerfTraceName = (name: string): boolean => TRACE_NAME.test(name);

export const normalizePerfAttributeValue = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, MAX_ATTRIBUTE_VALUE_LENGTH);
};

export const normalizePerfMetricValue = (value: number): number | null =>
    Number.isFinite(value) ? Math.round(value) : null;
