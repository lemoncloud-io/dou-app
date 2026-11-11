import { useSyncExternalStore } from 'react';

import { webClient } from '@chatic/bridges';
import type {
    OnAudioRecordingEndedPayload,
    OnAudioRecordingStartedPayload,
    StartAudioRecordingErrorCode,
} from '@chatic/bridge-messages';

import { shellCapabilities } from './shellCapabilities';

/**
 * The app's voice-message recorder. The page never opens the microphone itself: the shell records
 * into a file of its own and hands back the same kind of address its documents picker does, which the
 * send then uploads like any picked file.
 *
 * Offered only when the handshake lists `StartAudioRecording` — an app built before the recorder
 * never shows the microphone, rather than showing one that fails. The handshake lists the handlers an
 * app registered, and the recorder's are registered only where the native module exists.
 */

/** The longest voice message. The shell holds every recording to it whatever is asked. */
export const VOICE_MESSAGE_MAX_MS = 300_000;

/**
 * The start waits on the OS prompt the first time, for as long as the person takes to answer it; past
 * that, a start is one bridge round trip.
 */
const START_TIMEOUT_MS = 5 * 60_000;

/** A stop writes the file's end and checks its header: short, but not a round trip. */
const STOP_TIMEOUT_MS = 30_000;

export type StartRecordingResult =
    | { ok: true; started: OnAudioRecordingStartedPayload }
    | { ok: false; reason: StartAudioRecordingErrorCode | 'UNAVAILABLE' };

const codeOf = (error: unknown): string | undefined => (error as { code?: unknown })?.code as string | undefined;

const START_CODES: readonly string[] = ['PERMISSION_DENIED', 'BUSY', 'INTERNAL'];

export const audioRecorder = {
    /** Whether this shell records — its handshake lists the start. `false` in a browser tab. */
    isSupported: (): boolean => shellCapabilities.supports('StartAudioRecording'),

    async start(): Promise<StartRecordingResult> {
        try {
            const { data } = await webClient.request(
                { type: 'StartAudioRecording', data: { maxDurationMs: VOICE_MESSAGE_MAX_MS } },
                { timeoutMs: START_TIMEOUT_MS }
            );
            return { ok: true, started: data };
        } catch (error) {
            const code = codeOf(error);
            // `NOT_FOUND` here means the handshake listed a handler that is gone; nothing to record with.
            if (code === 'NOT_FOUND') return { ok: false, reason: 'UNAVAILABLE' };
            return {
                ok: false,
                reason: code && START_CODES.includes(code) ? (code as StartAudioRecordingErrorCode) : 'INTERNAL',
            };
        }
    },

    /**
     * Ends the recording. `null` when there was nothing to end — the shell ended it by itself and
     * pushed that end (`onEnded`), or the answer never came.
     */
    async stop(action: 'send' | 'cancel'): Promise<OnAudioRecordingEndedPayload | null> {
        try {
            const { data } = await webClient.request(
                { type: 'StopAudioRecording', data: { action } },
                { timeoutMs: STOP_TIMEOUT_MS }
            );
            return data;
        } catch {
            return null;
        }
    },

    /** The ends the shell reports by itself: the limit reached, or an interruption. */
    onEnded: (handler: (ended: OnAudioRecordingEndedPayload) => void): (() => void) =>
        webClient.onEvent('OnAudioRecordingEnded', message => {
            if (message.success && message.data) handler(message.data);
        }),
};

/** Re-renders when the handshake arrives. */
export const useCanRecordAudio = (): boolean =>
    useSyncExternalStore(shellCapabilities.subscribe, audioRecorder.isSupported);
