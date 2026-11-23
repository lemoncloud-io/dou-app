import type { LogEntry, TelemetryKind } from '../core/types';
import type { TelemetryRecordFields } from './TelemetryRecorder';

export interface TelemetryRecorderLike {
    record(kind: TelemetryKind, name: string, fields?: TelemetryRecordFields): LogEntry | undefined;
}

let current: TelemetryRecorderLike | undefined;

export const setTelemetryRecorder = (recorder: TelemetryRecorderLike | undefined): void => {
    current = recorder;
};

export const recordTelemetry = (kind: TelemetryKind, name: string, fields?: TelemetryRecordFields): void => {
    try {
        current?.record(kind, name, fields);
    } catch {
        /* the measurement is lost, the caller is not */
    }
};
