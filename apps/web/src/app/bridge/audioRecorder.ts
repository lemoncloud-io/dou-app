import { useSyncExternalStore } from 'react';

import { webClient } from '@chatic/bridges';
import type {
    OnAudioRecordingEndedPayload,
    OnAudioRecordingStartedPayload,
    StartAudioRecordingErrorCode,
} from '@chatic/bridge-messages';

import { shellCapabilities } from './shellCapabilities';

export const VOICE_MESSAGE_MAX_MS = 300_000;

const START_TIMEOUT_MS = 5 * 60_000;

const STOP_TIMEOUT_MS = 30_000;

export type StartRecordingResult =
    | { ok: true; started: OnAudioRecordingStartedPayload }
    | { ok: false; reason: StartAudioRecordingErrorCode | 'UNAVAILABLE' };

const codeOf = (error: unknown): string | undefined => (error as { code?: unknown })?.code as string | undefined;

const START_CODES: readonly string[] = ['PERMISSION_DENIED', 'BUSY', 'INTERNAL'];

export const audioRecorder = {
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
            if (code === 'NOT_FOUND') return { ok: false, reason: 'UNAVAILABLE' };
            return {
                ok: false,
                reason: code && START_CODES.includes(code) ? (code as StartAudioRecordingErrorCode) : 'INTERNAL',
            };
        }
    },

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

    onEnded: (handler: (ended: OnAudioRecordingEndedPayload) => void): (() => void) =>
        webClient.onEvent('OnAudioRecordingEnded', message => {
            if (message.success && message.data) handler(message.data);
        }),
};

export const useCanRecordAudio = (): boolean =>
    useSyncExternalStore(shellCapabilities.subscribe, audioRecorder.isSupported);
