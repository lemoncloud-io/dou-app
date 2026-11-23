import { createLogId } from '../core/logId';
import { validateTelemetryRecord } from './catalog';
import { FORCED_ATTR } from './TelemetrySampler';
import { TELEMETRY_STREAM_AREA, telemetryStreamOf } from './policy';

import type { LogContext, LogContextProvider, LogEntry, TelemetryKind } from '../core/types';
import type { TelemetryCatalog, TelemetryRejection } from './catalog';
import type { TelemetrySampler } from './TelemetrySampler';

export interface TelemetryRecordFields {
    durationMs?: number;
    attrs?: Record<string, string>;
    metrics?: Record<string, number>;
    timestamp?: number;
}

export interface TelemetryRecorderOptions {
    publish: (entry: LogEntry) => void;
    context?: LogContextProvider;
    sampler: TelemetrySampler;
    catalog: TelemetryCatalog;
    now?: () => number;
    onReject?: (rejection: TelemetryRejection) => void;
}

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
            return {};
        }
    }
}
