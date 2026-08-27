import type { Logger } from '../core/types';
import type { PerfMetricRecord } from './types';

/** Tag every metric entry carries, so `tag=PERF` is the whole server-side filter. */
export const PERF_LOG_TAG = 'PERF';

/**
 * A destination for finished measurements.
 *
 * The object form of "where does a metric go", mirroring `LogSink` for entries.
 * It exists because ADR-0071 already names the successor: metrics ride the log
 * pipeline today because that costs no backend work, and move to a dedicated
 * endpoint once the sample volume outgrows offline aggregation. That migration
 * is a second implementation of this interface and nothing else — the reporter,
 * the budgets and every call site stay put.
 */
export interface PerfMetricSink {
    emit(record: PerfMetricRecord): void;
}

/**
 * Publishes measurements as `info` / `PERF` log entries (ADR-0071).
 *
 * The split of duties inside the entry is the point: `message` is a sentence for
 * whoever is scanning the log monitor, `data` is the payload a script parses.
 * One string cannot serve both readers without one of them losing, which is why
 * no number is ever written into the prose.
 *
 * `info` rather than `warn`: the level says what kind of record this is, not how
 * much it matters. Promoting metrics to dodge the backpressure drop order would
 * pollute the signal that levels exist to carry.
 */
export class LoggerPerfMetricSink implements PerfMetricSink {
    constructor(
        private readonly logger: Logger,
        private readonly tag: string = PERF_LOG_TAG
    ) {}

    public emit(record: PerfMetricRecord): void {
        this.logger.info(this.tag, `${record.metric} ${record.ms}ms`, record);
    }
}
