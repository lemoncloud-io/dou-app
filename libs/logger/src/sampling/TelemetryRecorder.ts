import { createLogId } from '../core/logId';
import { validateTelemetryRecord } from './catalog';
import { FORCED_ATTR } from './TelemetrySampler';
import { TELEMETRY_STREAM_AREA, telemetryStreamOf } from './policy';

import type { LogContext, LogContextProvider, LogEntry, TelemetryKind } from '../core/types';
import type { TelemetryCatalog, TelemetryRejection } from './catalog';
import type { TelemetrySampler } from './TelemetrySampler';

export interface TelemetryRecordFields {
    /** Required for a trace. */
    durationMs?: number;
    attrs?: Record<string, string>;
    metrics?: Record<string, number>;
    /** When it happened, epoch ms. Defaults to now. */
    timestamp?: number;
}

export interface TelemetryRecorderOptions {
    /**
     * Where a kept record goes — the host passes `ingestLogEntry`, so a record reaches the same hub,
     * listeners and queue a log does. Taking it as an argument keeps this module off the singleton.
     */
    publish: (entry: LogEntry) => void;
    /** The same provider the host registers with `setLogContextProvider`. */
    context?: LogContextProvider;
    sampler: TelemetrySampler;
    catalog: TelemetryCatalog;
    now?: () => number;
    /**
     * Told about every record, attribute or metric the catalogue refused. The host prints it in a
     * development build. It must not call `logger`: a refusal is a coding mistake to fix, not an
     * event worth a queue slot.
     */
    onReject?: (rejection: TelemetryRejection) => void;
}

/**
 * Turns a measurement or an event into a statistics entry, or into nothing.
 *
 * In order: the catalogue check (refusals are reported even while statistics are off, so a bad call
 * site shows up in development before the server ever opens the policy); then the sampling verdict —
 * a record not sampled, which under the default policy is every record, **creates no entry at all**,
 * so it never takes a queue slot or a bridge hop; then the entry, stamped like a log (context, id,
 * timestamp) plus `kind`, the structured fields, `sr`, `pv` and a per-run `seq`.
 *
 * The level is always `info`. A statistic is not a severity, and `info` is what keeps it clear of the
 * level rules: `debug` never reaches the server from a release build.
 */
export class TelemetryRecorder {
    private readonly options: TelemetryRecorderOptions;
    private readonly now: () => number;
    private seq = 0;

    constructor(options: TelemetryRecorderOptions) {
        this.options = options;
        this.now = options.now ?? Date.now;
    }

    public trace(name: string, fields: TelemetryRecordFields): LogEntry | undefined {
        return this.record('trace', name, fields);
    }

    public sample(name: string, fields: TelemetryRecordFields = {}): LogEntry | undefined {
        return this.record('sample', name, fields);
    }

    public event(name: string, fields: TelemetryRecordFields = {}): LogEntry | undefined {
        return this.record('event', name, fields);
    }

    /** The full tag a record of this kind and name carries: `perf.<name>` or `usage.<name>`. */
    public static tagOf(kind: TelemetryKind, name: string): string {
        return `${TELEMETRY_STREAM_AREA[telemetryStreamOf(kind)]}.${name}`;
    }

    public record(kind: TelemetryKind, name: string, fields: TelemetryRecordFields = {}): LogEntry | undefined {
        const tag = TelemetryRecorder.tagOf(kind, name);
        const validation = validateTelemetryRecord(this.options.catalog, {
            tag,
            kind,
            durationMs: fields.durationMs,
            attrs: fields.attrs,
            metrics: fields.metrics,
        });
        validation.rejections.forEach(rejection => this.reject(rejection));
        if (!validation.ok) return undefined;

        const context = this.readContext();
        const decision = this.options.sampler.decideFor(kind, tag, context);
        if (!decision.sampled) return undefined;

        // `forced` goes first: the wire keeps the first 16 attributes, and losing this one would make a
        // forced record read as a sampled one.
        const attrs = decision.forced ? { [FORCED_ATTR]: '1', ...validation.attrs } : validation.attrs;
        this.seq += 1;

        const entry: LogEntry = {
            ...context,
            id: createLogId(),
            level: 'info',
            tag,
            message: name,
            kind,
            timestamp: fields.timestamp ?? this.now(),
            ...(kind === 'trace' ? { durationMs: fields.durationMs } : {}),
            ...(attrs ? { attrs } : {}),
            ...(validation.metrics ? { metrics: validation.metrics } : {}),
            sr: decision.sr,
            pv: decision.pv,
            seq: this.seq,
        };

        this.options.publish(entry);
        return entry;
    }

    private reject(rejection: TelemetryRejection): void {
        try {
            this.options.onReject?.(rejection);
        } catch {
            // A reporting hook must not take the recording path down with it.
        }
    }

    private readContext(): LogContext {
        try {
            return this.options.context?.() ?? {};
        } catch {
            // Same rule as the logger: a broken provider never stops a record.
            return {};
        }
    }
}
