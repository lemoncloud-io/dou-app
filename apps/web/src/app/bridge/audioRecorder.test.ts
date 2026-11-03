import { webClient } from '@chatic/bridges';
import type { OnWebAppReadyPayload } from '@chatic/bridge-messages';

import { audioRecorder, VOICE_MESSAGE_MAX_MS } from './audioRecorder';
import { shellCapabilities } from './shellCapabilities';

jest.mock('@chatic/bridges', () => ({
    webClient: { request: jest.fn(), onEvent: jest.fn() },
}));

const request = webClient.request as jest.Mock;
const onEvent = webClient.onEvent as jest.Mock;

const report = (supportedWebMessages: string[]): OnWebAppReadyPayload => ({
    protocolVersion: '2.12.0',
    supportedWebMessages,
    supportedAppMessages: [],
});

const failure = (code: string) => Object.assign(new Error(code), { code });

describe('audioRecorder', () => {
    beforeEach(() => {
        request.mockReset();
        onEvent.mockReset();
        shellCapabilities.reset();
    });

    it('records only where the handshake lists the start: never in a browser or an app built before it', () => {
        expect(audioRecorder.isSupported()).toBe(false);

        shellCapabilities.setReport(report(['PickAttachments']));
        expect(audioRecorder.isSupported()).toBe(false);

        shellCapabilities.setReport(report(['PickAttachments', 'StartAudioRecording', 'StopAudioRecording']));
        expect(audioRecorder.isSupported()).toBe(true);
    });

    it('asks for five minutes and hands back when the shell started', async () => {
        request.mockResolvedValue({ data: { startedAt: 5, maxDurationMs: VOICE_MESSAGE_MAX_MS } });

        await expect(audioRecorder.start()).resolves.toEqual({
            ok: true,
            started: { startedAt: 5, maxDurationMs: VOICE_MESSAGE_MAX_MS },
        });
        expect(request).toHaveBeenCalledWith(
            { type: 'StartAudioRecording', data: { maxDurationMs: 300_000 } },
            expect.objectContaining({ timeoutMs: expect.any(Number) })
        );
    });

    it('keeps the codes the start defines and reads anything else as INTERNAL', async () => {
        request.mockRejectedValueOnce(failure('PERMISSION_DENIED'));
        request.mockRejectedValueOnce(failure('NOT_FOUND'));
        request.mockRejectedValueOnce(failure('TIMEOUT'));

        await expect(audioRecorder.start()).resolves.toEqual({ ok: false, reason: 'PERMISSION_DENIED' });
        await expect(audioRecorder.start()).resolves.toEqual({ ok: false, reason: 'UNAVAILABLE' });
        await expect(audioRecorder.start()).resolves.toEqual({ ok: false, reason: 'INTERNAL' });
    });

    it('answers a stop with how it ended, or null when the shell had already ended it', async () => {
        request.mockResolvedValueOnce({ data: { reason: 'CANCELLED' } });
        request.mockRejectedValueOnce(failure('NOT_RECORDING'));

        await expect(audioRecorder.stop('cancel')).resolves.toEqual({ reason: 'CANCELLED' });
        await expect(audioRecorder.stop('send')).resolves.toBeNull();
    });

    it('hands on the ends the shell pushes, and nothing from a failed push', () => {
        const handler = jest.fn();
        audioRecorder.onEnded(handler);
        const listener = onEvent.mock.calls[0][1];

        listener({ type: 'OnAudioRecordingEnded', success: true, data: { reason: 'INTERRUPTED' } });
        listener({ type: 'OnAudioRecordingEnded', success: false });

        expect(onEvent.mock.calls[0][0]).toBe('OnAudioRecordingEnded');
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith({ reason: 'INTERRUPTED' });
    });
});
