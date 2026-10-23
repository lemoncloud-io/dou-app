import type { LogEntry, TelemetryKind } from '../core/types';
import type { TelemetryRecordFields } from './TelemetryRecorder';

/** What the slot needs from a `TelemetryRecorder`. */
export interface TelemetryRecorderLike {
    record(kind: TelemetryKind, name: string, fields?: TelemetryRecordFields): LogEntry | undefined;
}

let current: TelemetryRecorderLike | undefined;

/**
 * The process's statistics recorder, for code that measures but does not own one — the HTTP layer,
 * which every request passes through but which knows nothing of policies or runs.
 *
 * The host sets it at boot with the recorder it built over the run's policy. Until then — and in a
 * host that never does — `recordTelemetry` does nothing, which is the "statistics off" default.
 */
export const setTelemetryRecorder = (recorder: TelemetryRecorderLike | undefined): void => {
    current = recorder;
};

/**
 * Records a statistic through the process recorder, if there is one. Never throws: a measurement
 * must not become the caller's exception.
 */
export const recordTelemetry = (kind: TelemetryKind, name: string, fields?: TelemetryRecordFields): void => {
    try {
        current?.record(kind, name, fields);
    } catch {
        /* the measurement is lost, the caller is not */
    }
};
