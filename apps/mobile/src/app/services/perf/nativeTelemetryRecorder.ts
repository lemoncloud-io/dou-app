import { createLogId, ingestLogEntry, validateTelemetryRecord } from '@chatic/logger';
import { PERF_TELEMETRY_CATALOG } from '@chatic/perf';

import type { LogContextProvider, LogEntry } from '@chatic/logger';
import type { PerfTelemetryRecorder } from '@chatic/perf';

export interface NativeTelemetryRecorderOptions {
    context: LogContextProvider;
    publish?: (entry: LogEntry) => void;
    now?: () => number;
}

export const createNativeTelemetryRecorder = ({
    context,
    publish = ingestLogEntry,
    now = Date.now,
}: NativeTelemetryRecorderOptions): PerfTelemetryRecorder => {
    let seq = 0;

    const readContext = () => {
        try {
            return context() ?? {};
        } catch {
            return {};
        }
    };

    return {
        record(kind, name, fields) {
            const tag = `perf.${name}`;
            const checked = validateTelemetryRecord(PERF_TELEMETRY_CATALOG, {
                tag,
                kind,
                durationMs: fields.durationMs,
                attrs: fields.attrs,
                metrics: fields.metrics,
            });
            if (!checked.ok) return undefined;

            seq += 1;
            const entry: LogEntry = {
                ...readContext(),
                id: createLogId(),
                level: 'info',
                tag,
                message: name,
                kind,
                timestamp: fields.timestamp ?? now(),
                ...(kind === 'trace' ? { durationMs: fields.durationMs } : {}),
                ...(checked.attrs ? { attrs: checked.attrs } : {}),
                ...(checked.metrics ? { metrics: checked.metrics } : {}),
                seq,
            };
            publish(entry);
            return entry;
        },
    };
};
