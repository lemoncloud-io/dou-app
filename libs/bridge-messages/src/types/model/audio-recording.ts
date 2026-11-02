// --- Audio Recording Types ---
//
// A voice message for a chat, recorded by the shell. The web never touches the microphone: the shell
// records with the OS recorder (iOS `AVAudioRecorder`, Android `MediaRecorder`) into a file of its own
// inside the `attach-pick` folder, and answers with the same reference `PickAttachments` gives for a
// document. The web uploads it from there with `StartFileTransfer`, as it does any picked file.
//
// The recording is always AAC-LC, mono, 44.1 kHz, 64 kbps in an `.m4a` (MPEG-4) file, typed
// `audio/mp4` — one of the server's audio formats, so no conversion follows.
//
// The web ships before the app: it offers the microphone only when the handshake lists
// `StartAudioRecording`, so an app built before these messages never shows the control.

import type { PickedShellAttachment } from './attachment-picker';

/**
 * [Request] Start recording, while the person holds the microphone button.
 *
 * The shell asks for the microphone permission first when it has not been decided, and starts only
 * when it is granted. One recording at a time.
 */
export type StartAudioRecordingPayload = {
    /**
     * Five minutes (300,000) at most: the shell holds every recording to that, and an absent or larger
     * value means it. Not a shared constant, since this package carries no values: each side keeps it.
     */
    maxDurationMs?: number;
};

/** [Response] The recording is running. */
export type OnAudioRecordingStartedPayload = {
    /** Epoch milliseconds the recorder started, for the elapsed time the web shows. */
    startedAt: number;
    /** The limit the shell applied: where it stops by itself and sends (`MAX_DURATION`). */
    maxDurationMs: number;
};

/**
 * The error codes `StartAudioRecording` fails with.
 * - `PERMISSION_DENIED`: no microphone permission — refused now, or before. The web points to Settings.
 * - `BUSY`: a recording is already running.
 * - `INTERNAL`: the recorder or the audio session could not start.
 */
export type StartAudioRecordingErrorCode = 'PERMISSION_DENIED' | 'BUSY' | 'INTERNAL';

/**
 * [Request] End the recording: `send` when the button is released, `cancel` when it was slid away or
 * the screen is leaving.
 */
export type StopAudioRecordingPayload = {
    action: 'send' | 'cancel';
};

/** A finished recording: a `file` the shell keeps in its `attach-pick` folder, typed `audio/mp4`. */
export type RecordedAudioFile = PickedShellAttachment & { kind: 'file' };

/**
 * How a recording ended.
 *
 * - `SENT`: `send` was asked for, and the file is ready.
 * - `MAX_DURATION`: it reached its limit; the shell stopped it and the file is ready (pushed).
 * - `CANCELLED`: `cancel` was asked for. The file is deleted.
 * - `TOO_SHORT`: `send` came under one second in. The file is deleted.
 * - `INTERRUPTED`: a call, another app taking the audio, or the app leaving the foreground. The file is
 *   deleted (pushed).
 * - `INTERNAL`: the recorder failed, or wrote a file that is not MPEG-4 audio. The file is deleted.
 */
export type OnAudioRecordingEndedPayload =
    | { reason: 'SENT' | 'MAX_DURATION'; file: RecordedAudioFile; durationMs: number }
    | { reason: 'CANCELLED' | 'TOO_SHORT' | 'INTERRUPTED' | 'INTERNAL' };

/**
 * The error codes `StopAudioRecording` fails with.
 * - `NOT_RECORDING`: nothing is recording — it already ended by itself, and that end was pushed.
 * - `INVALID`: `action` is neither `send` nor `cancel`.
 */
export type StopAudioRecordingErrorCode = 'NOT_RECORDING' | 'INVALID';
