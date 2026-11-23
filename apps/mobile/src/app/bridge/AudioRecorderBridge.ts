import { NativeEventEmitter, NativeModules } from 'react-native';
import type { OnAudioRecordingEndedPayload, OnAudioRecordingStartedPayload } from '@chatic/bridge-messages';

const { AudioRecorder } = NativeModules;

export const AUDIO_RECORDER_ENDED_EVENT = 'AudioRecorderEnded';

export interface IAudioRecorderBridge {
    readonly isAvailable: boolean;
    start(maxDurationMs: number): Promise<OnAudioRecordingStartedPayload>;
    stop(action: 'send' | 'cancel'): Promise<OnAudioRecordingEndedPayload>;
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
