import type { TelemetryKind } from '../core/types';

export const MAX_TELEMETRY_ATTRS = 16;
export const MAX_TELEMETRY_METRICS = 32;
export const MAX_TELEMETRY_ATTR_VALUE_LENGTH = 100;

const DIMENSION_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

export interface TelemetryCatalogItem {
    kinds: readonly TelemetryKind[];
    attrs?: Readonly<Record<string, readonly string[] | true>>;
    metrics?: readonly string[];
}

export type TelemetryCatalog = Readonly<Record<string, TelemetryCatalogItem>>;

export type TelemetryRejectionReason =
    | 'unknown_record'
    | 'wrong_kind'
    | 'bad_duration'
    | 'unknown_attr'
    | 'bad_attr_value'
    | 'unknown_metric'
    | 'bad_metric_value'
    | 'too_many';

export interface TelemetryRejection {
    tag: string;
    reason: TelemetryRejectionReason;
    key?: string;
}

export interface TelemetryRecordInput {
    tag: string;
    kind: TelemetryKind;
    durationMs?: number;
    attrs?: Record<string, string>;
    metrics?: Record<string, number>;
}

export type TelemetryValidation =
    | { ok: false; rejections: TelemetryRejection[] }
    | {
          ok: true;
          attrs?: Record<string, string>;
          metrics?: Record<string, number>;
          rejections: TelemetryRejection[];
      };

export const validateTelemetryRecord = (
    catalog: TelemetryCatalog,
    input: TelemetryRecordInput
): TelemetryValidation => {
    const { tag } = input;
    const item = Object.prototype.hasOwnProperty.call(catalog, tag) ? catalog[tag] : undefined;
    if (!item) return { ok: false, rejections: [{ tag, reason: 'unknown_record' }] };
    if (!item.kinds.includes(input.kind)) return { ok: false, rejections: [{ tag, reason: 'wrong_kind' }] };
    if (
        input.kind === 'trace' &&
        !(typeof input.durationMs === 'number' && Number.isFinite(input.durationMs) && input.durationMs >= 0)
    ) {
        return { ok: false, rejections: [{ tag, reason: 'bad_duration' }] };
    }

    const rejections: TelemetryRejection[] = [];

    let attrs: Record<string, string> | undefined;
    for (const [key, value] of Object.entries(input.attrs ?? {})) {
        const allowed =
            item.attrs && Object.prototype.hasOwnProperty.call(item.attrs, key) ? item.attrs[key] : undefined;
        if (!allowed || !DIMENSION_KEY.test(key)) {
            rejections.push({ tag, reason: 'unknown_attr', key });
            continue;
        }
        const valid =
            typeof value === 'string' &&
            value.length > 0 &&
            value.length <= MAX_TELEMETRY_ATTR_VALUE_LENGTH &&
            (allowed === true || allowed.includes(value));
        if (!valid) {
            rejections.push({ tag, reason: 'bad_attr_value', key });
            continue;
        }
        attrs ??= {};
        if (Object.keys(attrs).length >= MAX_TELEMETRY_ATTRS) {
            rejections.push({ tag, reason: 'too_many', key });
            continue;
        }
        attrs[key] = value;
    }

    let metrics: Record<string, number> | undefined;
    for (const [key, value] of Object.entries(input.metrics ?? {})) {
        if (!item.metrics?.includes(key) || !DIMENSION_KEY.test(key)) {
            rejections.push({ tag, reason: 'unknown_metric', key });
            continue;
        }
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            rejections.push({ tag, reason: 'bad_metric_value', key });
            continue;
        }
        metrics ??= {};
        if (Object.keys(metrics).length >= MAX_TELEMETRY_METRICS) {
            rejections.push({ tag, reason: 'too_many', key });
            continue;
        }
        metrics[key] = Math.round(value);
    }

    return { ok: true, attrs, metrics, rejections };
};
