import { NativeEventEmitter, NativeModules } from 'react-native';
import type { OnAudioRecordingEndedPayload, OnAudioRecordingStartedPayload } from '@chatic/bridge-messages';

/**
 * AudioRecorder — the voice-message recorder (Swift `AudioRecorder`, Kotlin `AudioRecorderModule`).
 *
 * The native side records AAC into an `.m4a` inside the picker's `attach-pick` folder and answers
 * with the wire payloads as they are, so the handler only relays. It never asks for the microphone
 * permission itself; the handler does that first, through `PermissionService`, and native only
 * refuses with `PERMISSION_DENIED` when it is still missing.
 *
 * A native build without the module has `isAvailable` false, and the router then leaves the two
 * messages unregistered: the handshake does not list them, and the web draws no microphone.
 */
const { AudioRecorder } = NativeModules;

/** Event the native recorder emits when it ends a recording by itself — its limit, or an interruption. */
export const AUDIO_RECORDER_ENDED_EVENT = 'AudioRecorderEnded';

export interface IAudioRecorderBridge {
    /** Whether this build has the native module. */
    readonly isAvailable: boolean;
    /**
     * Starts recording, held to `maxDurationMs` (five minutes at most). Rejects with
     * `PERMISSION_DENIED`, `BUSY` or `INTERNAL`.
     */
    start(maxDurationMs: number): Promise<OnAudioRecordingStartedPayload>;
    /**
     * Ends the recording: `send` keeps the file (or reports `TOO_SHORT` under a second), `cancel`
     * deletes it. Rejects with `NOT_RECORDING` when it already ended by itself, `INVALID` otherwise.
     */
    stop(action: 'send' | 'cancel'): Promise<OnAudioRecordingEndedPayload>;
    /** Subscribes to the ends native reports by itself. Returns the unsubscribe function. */
    subscribe(listener: (ended: OnAudioRecordingEndedPayload) => void): () => void;
}

const unavailable = (): Promise<never> =>
    Promise.reject(Object.assign(new Error('AudioRecorder native module is not available'), { code: 'INTERNAL' }));

const emitter = AudioRecorder ? new NativeEventEmitter(AudioRecorder) : null;

export const AudioRecorderBridge: IAudioRecorderBridge = {
    isAvailable: !!AudioRecorder,
    start: maxDurationMs => (AudioRecorder ? AudioRecorder.start(maxDurationMs) : unavailable()),
    stop: action => (AudioRecorder ? AudioRecorder.stop(action) : unavailable()),
    subscribe: listener => {
        if (!emitter) return () => undefined;
        const subscription = emitter.addListener(AUDIO_RECORDER_ENDED_EVENT, listener);
        return () => subscription.remove();
    },
};
