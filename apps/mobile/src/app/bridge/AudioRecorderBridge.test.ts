// `jest.mock` is hoisted above this import, so the bridge reads the mocked module.
import { AUDIO_RECORDER_ENDED_EVENT, AudioRecorderBridge } from './AudioRecorderBridge';

const mockStart = jest.fn();
const mockStop = jest.fn();
const mockAddListener = jest.fn();

jest.mock('react-native', () => ({
    NativeModules: {
        AudioRecorder: {
            start: (...args: unknown[]) => mockStart(...args),
            stop: (...args: unknown[]) => mockStop(...args),
        },
    },
    NativeEventEmitter: jest.fn().mockImplementation(() => ({
        addListener: (...args: unknown[]) => mockAddListener(...args),
    })),
}));

describe('AudioRecorderBridge', () => {
    it('is available where the native module exists', () => {
        expect(AudioRecorderBridge.isAvailable).toBe(true);
    });

    it('passes the limit to native start and the action to native stop', async () => {
        mockStart.mockResolvedValue({ startedAt: 1, maxDurationMs: 300_000 });
        mockStop.mockResolvedValue({ reason: 'CANCELLED' });

        await expect(AudioRecorderBridge.start(300_000)).resolves.toEqual({ startedAt: 1, maxDurationMs: 300_000 });
        await expect(AudioRecorderBridge.stop('cancel')).resolves.toEqual({ reason: 'CANCELLED' });
        expect(mockStart).toHaveBeenCalledWith(300_000);
        expect(mockStop).toHaveBeenCalledWith('cancel');
    });

    it('listens to the native end event and removes the listener on unsubscribe', () => {
        const remove = jest.fn();
        mockAddListener.mockReturnValue({ remove });
        const listener = jest.fn();

        const unsubscribe = AudioRecorderBridge.subscribe(listener);

        expect(mockAddListener).toHaveBeenCalledWith(AUDIO_RECORDER_ENDED_EVENT, listener);
        unsubscribe();
        expect(remove).toHaveBeenCalled();
    });
});
