import type { PickedShellAttachment } from './attachment-picker';

export type StartAudioRecordingPayload = {
    maxDurationMs?: number;
};

export type OnAudioRecordingStartedPayload = {
    startedAt: number;
    maxDurationMs: number;
};

export type StartAudioRecordingErrorCode = 'PERMISSION_DENIED' | 'BUSY' | 'INTERNAL';

export type StopAudioRecordingPayload = {
    action: 'send' | 'cancel';
};

export type RecordedAudioFile = PickedShellAttachment & { kind: 'file' };

export type OnAudioRecordingEndedPayload =
    | { reason: 'SENT' | 'MAX_DURATION'; file: RecordedAudioFile; durationMs: number }
    | { reason: 'CANCELLED' | 'TOO_SHORT' | 'INTERRUPTED' | 'INTERNAL' };

export type StopAudioRecordingErrorCode = 'NOT_RECORDING' | 'INVALID';
