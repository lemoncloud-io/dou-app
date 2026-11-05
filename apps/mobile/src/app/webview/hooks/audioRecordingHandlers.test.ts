import type { IAppBridgeHost } from '@chatic/bridges';
import type { OnAudioRecordingEndedPayload } from '@chatic/bridge-messages';
import type { IAudioRecorderBridge } from '../../bridge';
import type { ILogService, IPermissionService } from '../../services';

import { pushedEventErrors, pushedEvents } from './appEventContract';
import { AUDIO_RECORDING_MAX_MS, createAudioRecordingHandlers, recordingLimit } from './audioRecordingHandlers';

// The real bridge barrel loads every native module wrapper; the handlers receive the recorder by
// injection and need nothing else from it at runtime.
jest.mock('../../bridge', () => ({}));

const createBridgeMock = (): jest.Mocked<IAppBridgeHost> =>
    ({
        registerHandler: jest.fn(),
        unregisterHandler: jest.fn(),
        pushEvent: jest.fn(),
        handleMessage: jest.fn(),
    }) as any;

const createLoggerMock = (): jest.Mocked<ILogService> =>
    ({ subscribe: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) as any;

const createRecorderMock = (): jest.Mocked<IAudioRecorderBridge> => ({
    isAvailable: true,
    start: jest.fn(),
    stop: jest.fn(),
    subscribe: jest.fn(),
});

const createPermissionsMock = (): jest.Mocked<IPermissionService> => ({
    check: jest.fn(),
    status: jest.fn(),
    request: jest.fn(),
});

const sent: OnAudioRecordingEndedPayload = {
    reason: 'SENT',
    file: {
        kind: 'file',
        uri: 'file:///data/user/0/io.chatic.dou/cache/attach-pick/rec-1/voice-20261102-101500.m4a',
        name: 'voice-20261102-101500.m4a',
        contentType: 'audio/mp4',
        size: 64_000,
    },
    durationMs: 8_000,
};

const message = <T>(data: T) => ({ type: 'x', data, version: '2.13.0', refId: 'r1' }) as any;

describe('audioRecordingHandlers', () => {
    let bridge: jest.Mocked<IAppBridgeHost>;
    let recorder: jest.Mocked<IAudioRecorderBridge>;
    let permissions: jest.Mocked<IPermissionService>;

    const handlers = () => createAudioRecordingHandlers(bridge, recorder, permissions, createLoggerMock());

    beforeEach(() => {
        bridge = createBridgeMock();
        recorder = createRecorderMock();
        permissions = createPermissionsMock();
    });

    describe('recordingLimit', () => {
        it('keeps a limit under five minutes and holds a longer one to five', () => {
            expect(recordingLimit(60_000)).toBe(60_000);
            expect(recordingLimit(600_000)).toBe(AUDIO_RECORDING_MAX_MS);
        });

        it('reads a missing, zero or non-number limit as five minutes', () => {
            expect(recordingLimit(undefined)).toBe(AUDIO_RECORDING_MAX_MS);
            expect(recordingLimit(0)).toBe(AUDIO_RECORDING_MAX_MS);
            expect(recordingLimit('60000')).toBe(AUDIO_RECORDING_MAX_MS);
            expect(recordingLimit(Number.NaN)).toBe(AUDIO_RECORDING_MAX_MS);
        });
    });

    describe('StartAudioRecording', () => {
        it('starts at once when the microphone is already allowed, without asking again', async () => {
            permissions.check.mockResolvedValue(true);
            recorder.start.mockResolvedValue({ startedAt: 1_000, maxDurationMs: AUDIO_RECORDING_MAX_MS });

            const res = await handlers().handleStartAudioRecording(message({}));

            expect(permissions.request).not.toHaveBeenCalled();
            expect(recorder.start).toHaveBeenCalledWith(AUDIO_RECORDING_MAX_MS);
            expect(res).toEqual({
                type: 'OnAudioRecordingStarted',
                success: true,
                data: { startedAt: 1_000, maxDurationMs: AUDIO_RECORDING_MAX_MS },
            });
        });

        it('asks for the microphone when it is not allowed yet, and starts once it is granted', async () => {
            permissions.check.mockResolvedValue(false);
            permissions.request.mockResolvedValue('GRANTED');
            recorder.start.mockResolvedValue({ startedAt: 1_000, maxDurationMs: 60_000 });

            const res = await handlers().handleStartAudioRecording(message({ maxDurationMs: 60_000 }));

            expect(permissions.request).toHaveBeenCalledWith('MICROPHONE');
            expect(recorder.start).toHaveBeenCalledWith(60_000);
            expect(res.success).toBe(true);
        });

        it.each(['DENIED', 'BLOCKED'] as const)(
            'answers PERMISSION_DENIED for %s and records nothing',
            async status => {
                permissions.check.mockResolvedValue(false);
                permissions.request.mockResolvedValue(status);

                const res = await handlers().handleStartAudioRecording(message({}));

                expect(recorder.start).not.toHaveBeenCalled();
                expect(res).toMatchObject({
                    type: 'OnAudioRecordingStarted',
                    success: false,
                    error: { code: 'PERMISSION_DENIED' },
                });
            }
        );

        it('keeps a code native names, and turns an unknown one into INTERNAL', async () => {
            permissions.check.mockResolvedValue(true);
            recorder.start.mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'BUSY' }));
            recorder.start.mockRejectedValueOnce(Object.assign(new Error('?'), { code: 'NOT_FOUND' }));

            const busy = await handlers().handleStartAudioRecording(message({}));
            const other = await handlers().handleStartAudioRecording(message({}));

            expect(busy).toMatchObject({ success: false, error: { code: 'BUSY' } });
            expect(other).toMatchObject({ success: false, error: { code: 'INTERNAL' } });
        });
    });

    describe('StopAudioRecording', () => {
        it('relays the action and answers with how the recording ended', async () => {
            recorder.stop.mockResolvedValue(sent);

            const res = await handlers().handleStopAudioRecording(message({ action: 'send' }));

            expect(recorder.stop).toHaveBeenCalledWith('send');
            expect(res).toEqual({ type: 'OnAudioRecordingEnded', success: true, data: sent });
        });

        it('refuses an action other than send or cancel without reaching native', async () => {
            const res = await handlers().handleStopAudioRecording(message({ action: 'pause' }));

            expect(recorder.stop).not.toHaveBeenCalled();
            expect(res).toMatchObject({ success: false, error: { code: 'INVALID' } });
        });

        it('answers NOT_RECORDING when the shell had already ended the recording', async () => {
            recorder.stop.mockRejectedValue(Object.assign(new Error('idle'), { code: 'NOT_RECORDING' }));

            const res = await handlers().handleStopAudioRecording(message({ action: 'cancel' }));

            expect(res).toMatchObject({
                type: 'OnAudioRecordingEnded',
                success: false,
                error: { code: 'NOT_RECORDING' },
            });
        });
        it('answers a stop that failed in native as the INTERNAL end it was, since nothing was pushed', async () => {
            recorder.stop.mockRejectedValue(Object.assign(new Error('stop threw'), { code: 'INTERNAL' }));

            const res = await handlers().handleStopAudioRecording(message({ action: 'send' }));

            expect(res).toEqual({ type: 'OnAudioRecordingEnded', success: true, data: { reason: 'INTERNAL' } });
        });
    });

    describe('relayEndedEvents', () => {
        it('pushes an end the shell reports by itself as OnAudioRecordingEnded', () => {
            const unsubscribe = jest.fn();
            let listener: ((ended: OnAudioRecordingEndedPayload) => void) | undefined;
            recorder.subscribe.mockImplementationOnce(fn => {
                listener = fn;
                return unsubscribe;
            });

            const stop = handlers().relayEndedEvents();
            listener?.({ ...sent, reason: 'MAX_DURATION' });
            listener?.({ reason: 'INTERRUPTED' });

            expect(bridge.pushEvent).toHaveBeenNthCalledWith(1, {
                type: 'OnAudioRecordingEnded',
                success: true,
                data: { ...sent, reason: 'MAX_DURATION' },
            });
            expect(bridge.pushEvent).toHaveBeenNthCalledWith(2, {
                type: 'OnAudioRecordingEnded',
                success: true,
                data: { reason: 'INTERRUPTED' },
            });
            expect(pushedEventErrors(pushedEvents(bridge.pushEvent))).toEqual([]);
            stop();
            expect(unsubscribe).toHaveBeenCalled();
        });
    });
});
