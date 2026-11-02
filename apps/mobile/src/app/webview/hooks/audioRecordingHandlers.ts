import type { IAppBridgeHost } from '@chatic/bridges';
import type {
    StartAudioRecordingErrorCode,
    StopAudioRecordingErrorCode,
    WebMessageData,
    WebMessageHandlerResponse,
} from '@chatic/bridge-messages';
import type { IAudioRecorderBridge } from '../../bridge';
import type { ILogService, IPermissionService } from '../../services';
import { toError } from './attachmentPickerHandlers';

/** Five minutes: the longest voice message, whatever the web asks for. */
export const AUDIO_RECORDING_MAX_MS = 300_000;

const START_CODES: readonly string[] = ['PERMISSION_DENIED', 'BUSY', 'INTERNAL'];
const STOP_CODES: readonly string[] = ['NOT_RECORDING', 'INVALID'];
const ACTIONS: readonly string[] = ['send', 'cancel'];

/** The limit to record to: what the web asked, held to five minutes; anything unusable means five. */
export const recordingLimit = (requested: unknown): number =>
    typeof requested === 'number' && Number.isFinite(requested) && requested > 0
        ? Math.min(requested, AUDIO_RECORDING_MAX_MS)
        : AUDIO_RECORDING_MAX_MS;

/**
 * Relays `StartAudioRecording` and `StopAudioRecording` to the native recorder, and the ends it
 * reports by itself as the `OnAudioRecordingEnded` push.
 *
 * The microphone permission is asked for here, at the first press, and not by native code: the same
 * `PermissionService` the rest of the app asks through, so a refusal reads the same everywhere. A
 * refusal is `PERMISSION_DENIED`, which the web turns into a way to Settings.
 */
export const createAudioRecordingHandlers = (
    bridge: IAppBridgeHost,
    recorder: IAudioRecorderBridge,
    permissions: IPermissionService,
    logger: ILogService
) => {
    const handleStartAudioRecording = async (
        message: WebMessageData<'StartAudioRecording'>
    ): Promise<WebMessageHandlerResponse<'StartAudioRecording'>> => {
        const fail = (code: StartAudioRecordingErrorCode, text: string) => ({
            type: 'OnAudioRecordingStarted' as const,
            success: false,
            error: { code, message: text },
        });

        // A granted permission costs one check; anything else asks, which shows the OS prompt when
        // it has not been decided yet and answers at once when it was refused before.
        const granted =
            (await permissions.check('MICROPHONE')) || (await permissions.request('MICROPHONE')) === 'GRANTED';
        if (!granted) {
            logger.info('DEVICE', 'StartAudioRecording: no microphone permission');
            return fail('PERMISSION_DENIED', 'microphone permission is not granted');
        }

        try {
            const data = await recorder.start(recordingLimit(message.data?.maxDurationMs));
            logger.info('DEVICE', `StartAudioRecording: started, limit ${data.maxDurationMs}ms`);
            return { type: 'OnAudioRecordingStarted' as const, success: true, data };
        } catch (e) {
            const error = toError<StartAudioRecordingErrorCode>(e, START_CODES, 'INTERNAL');
            logger.warn('DEVICE', `StartAudioRecording failed: ${error.code}`);
            return fail(error.code, error.message);
        }
    };

    const handleStopAudioRecording = async (
        message: WebMessageData<'StopAudioRecording'>
    ): Promise<WebMessageHandlerResponse<'StopAudioRecording'>> => {
        const action = message.data?.action;
        if (typeof action !== 'string' || !ACTIONS.includes(action)) {
            return {
                type: 'OnAudioRecordingEnded' as const,
                success: false,
                error: { code: 'INVALID' as const, message: 'action must be send or cancel' },
            };
        }
        try {
            const data = await recorder.stop(action as 'send' | 'cancel');
            // The reason and length only: the file's path says nothing a log needs.
            logger.info(
                'DEVICE',
                `StopAudioRecording ${action}: ${data.reason}${'durationMs' in data ? ` ${data.durationMs}ms` : ''}`
            );
            return { type: 'OnAudioRecordingEnded' as const, success: true, data };
        } catch (e) {
            const code = (e as { code?: unknown })?.code;
            // `NOT_RECORDING` tells the web the end was already pushed, so it says nothing. Any other
            // failure ended the recording here with nothing pushed: it is answered as the `INTERNAL`
            // end it was, which the web says, rather than lost.
            if (typeof code !== 'string' || !STOP_CODES.includes(code)) {
                logger.warn('DEVICE', `StopAudioRecording failed: ${typeof code === 'string' ? code : 'unknown'}`);
                return { type: 'OnAudioRecordingEnded' as const, success: true, data: { reason: 'INTERNAL' as const } };
            }
            const error = toError<StopAudioRecordingErrorCode>(e, STOP_CODES, 'NOT_RECORDING');
            logger.warn('DEVICE', `StopAudioRecording failed: ${error.code}`);
            return { type: 'OnAudioRecordingEnded' as const, success: false, error };
        }
    };

    /**
     * Forwards the ends native reports by itself — the limit reached, an interruption — to the
     * WebView. Returns the unsubscribe function; the hook ties it to the router's lifetime.
     */
    const relayEndedEvents = () =>
        recorder.subscribe(ended => {
            logger.info('DEVICE', `AudioRecording ended by the shell: ${ended.reason}`);
            bridge.pushEvent<'OnAudioRecordingEnded'>({ type: 'OnAudioRecordingEnded', success: true, data: ended });
        });

    return { handleStartAudioRecording, handleStopAudioRecording, relayEndedEvents };
};
