import { createLogId, ingestLogEntry, validateTelemetryRecord } from '@chatic/logger';
import { PERF_TELEMETRY_CATALOG } from '@chatic/perf';

import type { LogContextProvider, LogEntry } from '@chatic/logger';
import type { PerfTelemetryRecorder } from '@chatic/perf';

export interface NativeTelemetryRecorderOptions {
    /** The native log context — the same provider native log lines are stamped with. */
    context: LogContextProvider;
    publish?: (entry: LogEntry) => void;
    now?: () => number;
}

/**
 * Records native traces (`boot`, `first_screen`) on the log pipeline, as statistics entries in the
 * app's own upload queue.
 *
 * **Unjudged.** Native code does not read the sampling policy — the web does — so a record carries no
 * `sr`/`pv` here. The web uploader judges it when it draws the batch from this queue, by the run id
 * the record carries, and lets an unsampled one go without sending it. Native statistics are a
 * handful per run, so holding them until then costs nothing.
 *
 * The catalogue check still applies here: what reaches the queue is only what the pipeline accepts.
 */
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
