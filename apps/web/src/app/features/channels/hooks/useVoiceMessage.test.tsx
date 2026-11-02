import '@testing-library/jest-dom';

import { act, createEvent, fireEvent, render, screen } from '@testing-library/react';

import type { OnAudioRecordingEndedPayload } from '@chatic/bridge-messages';
import type { ChatAttachmentSource } from '@chatic/data';

import type { audioRecorder, StartRecordingResult } from '../../../bridge/audioRecorder';
import { useVoiceMessage, VOICE_CANCEL_SLIDE_PX } from './useVoiceMessage';

const toast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (arg: unknown) => toast(arg) }));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

const openSettings = jest.fn();
jest.mock('../../../bridge/appBridge', () => ({ appBridge: { openSettings: () => openSettings() } }));
jest.mock('../../../bridge/haptics', () => ({ haptics: { play: jest.fn() } }));

const recording = {
    kind: 'file' as const,
    uri: 'file:///cache/attach-pick/a1/voice-20261102-101500.m4a',
    name: 'voice-20261102-101500.m4a',
    contentType: 'audio/mp4',
    size: 64_000,
};

/** A recorder whose answers the test hands out by hand. */
const fakeRecorder = () => {
    let resolveStart: (result: StartRecordingResult) => void = () => undefined;
    let pushEnded: (ended: OnAudioRecordingEndedPayload) => void = () => undefined;
    const recorder = {
        isSupported: () => true,
        start: jest.fn(
            () =>
                new Promise<StartRecordingResult>(resolve => {
                    resolveStart = resolve;
                })
        ),
        stop: jest.fn(async (): Promise<OnAudioRecordingEndedPayload | null> => ({ reason: 'CANCELLED' })),
        onEnded: jest.fn((handler: (ended: OnAudioRecordingEndedPayload) => void) => {
            pushEnded = handler;
            return () => undefined;
        }),
    };
    return {
        recorder: recorder as unknown as typeof audioRecorder & typeof recorder,
        started: (startedAt = 1_000) =>
            act(async () => resolveStart({ ok: true, started: { startedAt, maxDurationMs: 300_000 } })),
        refused: (reason: Exclude<StartRecordingResult, { ok: true }>['reason']) =>
            act(async () => resolveStart({ ok: false, reason })),
        push: (ended: OnAudioRecordingEndedPayload) => act(async () => pushEnded(ended)),
    };
};

let clock = 0;
const now = () => clock;

const Harness = ({
    recorder,
    sendImages,
    canRecord = true,
    disabled = false,
    scope = 'c1',
    typed = false,
}: {
    recorder: typeof audioRecorder;
    sendImages: (files: ChatAttachmentSource[]) => Promise<void>;
    canRecord?: boolean;
    disabled?: boolean;
    scope?: string;
    /** Something typed: the composer draws its send button instead of the microphone. */
    typed?: boolean;
}) => {
    const voice = useVoiceMessage({ sendImages, recorder, canRecord, disabled, scope, now });
    return (
        <div>
            {typed ? null : voice.button}
            {voice.dialogs}
            <span data-testid="recording">{String(voice.recording)}</span>
        </div>
    );
};

const mic = () => screen.getByRole('button', { name: 'chat.attach.voice.record' });
// jsdom has no PointerEvent, so what the hook reads — the coordinate, which finger — is set by hand.
const pointer = (type: 'pointerDown' | 'pointerMove' | 'pointerUp' | 'pointerCancel', x = 0, pointerId = 1) => {
    const event = createEvent[type](mic());
    Object.defineProperty(event, 'clientX', { value: x });
    Object.defineProperty(event, 'pointerId', { value: pointerId });
    fireEvent(mic(), event);
};
const press = (x = 300) => act(async () => pointer('pointerDown', x));
const lift = (pointerId = 1) => act(async () => pointer('pointerUp', 0, pointerId));

describe('useVoiceMessage', () => {
    beforeEach(() => {
        clock = 0;
        toast.mockReset();
        openSettings.mockReset();
    });

    it('draws no microphone where the app does not record', () => {
        const { recorder } = fakeRecorder();
        render(<Harness recorder={recorder} sendImages={jest.fn()} canRecord={false} />);

        expect(screen.queryByRole('button', { name: 'chat.attach.voice.record' })).not.toBeInTheDocument();
    });

    it('records while held and sends the file on release, typed audio/mp4', async () => {
        const fake = fakeRecorder();
        fake.recorder.stop.mockResolvedValue({ reason: 'SENT', file: recording, durationMs: 8_000 });
        const sendImages = jest.fn(async () => undefined);
        render(<Harness recorder={fake.recorder} sendImages={sendImages} />);

        await press();
        await fake.started();
        expect(screen.getByRole('status')).toHaveTextContent('chat.attach.voice.slideToCancel');
        expect(screen.getByTestId('recording')).toHaveTextContent('true');

        clock = 8_000;
        await lift();

        expect(fake.recorder.stop).toHaveBeenCalledWith('send');
        expect(sendImages).toHaveBeenCalledWith([
            {
                uri: recording.uri,
                name: 'voice-20261102-101500.m4a',
                type: 'audio/mp4',
                size: 64_000,
                kind: 'file',
            },
        ]);
        expect(screen.getByTestId('recording')).toHaveTextContent('false');
    });

    it('throws the recording away when the finger slid left past the threshold', async () => {
        const fake = fakeRecorder();
        const sendImages = jest.fn(async () => undefined);
        render(<Harness recorder={fake.recorder} sendImages={sendImages} />);

        await press(300);
        await fake.started();
        act(() => pointer('pointerMove', 300 - VOICE_CANCEL_SLIDE_PX - 1));
        expect(screen.getByRole('status')).toHaveTextContent('chat.attach.voice.releaseToCancel');
        await lift();

        expect(fake.recorder.stop).toHaveBeenCalledWith('cancel');
        expect(sendImages).not.toHaveBeenCalled();
        expect(toast).not.toHaveBeenCalled();
    });

    it('throws the recording away when the system takes the touch', async () => {
        const fake = fakeRecorder();
        render(<Harness recorder={fake.recorder} sendImages={jest.fn()} />);

        await press();
        await fake.started();
        await act(async () => pointer('pointerCancel'));

        expect(fake.recorder.stop).toHaveBeenCalledWith('cancel');
    });

    it('tells a short press to hold, when the shell keeps nothing under a second', async () => {
        const fake = fakeRecorder();
        fake.recorder.stop.mockResolvedValue({ reason: 'TOO_SHORT' });
        render(<Harness recorder={fake.recorder} sendImages={jest.fn()} />);

        await press();
        await fake.started();
        await lift();

        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.voice.holdToRecord' });
    });

    it('stops a recording the finger left before it started, and tells a quick tap to hold', async () => {
        const fake = fakeRecorder();
        render(<Harness recorder={fake.recorder} sendImages={jest.fn()} />);

        await press();
        await lift();
        clock = 200;
        await fake.started();

        expect(fake.recorder.stop).toHaveBeenCalledWith('cancel');
        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.voice.holdToRecord' });
        expect(screen.getByTestId('recording')).toHaveTextContent('false');
    });

    it('says nothing when the start waited on the permission prompt: the next press records', async () => {
        const fake = fakeRecorder();
        render(<Harness recorder={fake.recorder} sendImages={jest.fn()} />);

        await press();
        await lift();
        clock = 4_000;
        await fake.started();

        expect(fake.recorder.stop).toHaveBeenCalledWith('cancel');
        expect(toast).not.toHaveBeenCalled();
    });

    it('offers the way to Settings when the microphone is refused', async () => {
        const fake = fakeRecorder();
        render(<Harness recorder={fake.recorder} sendImages={jest.fn()} />);

        await press();
        await fake.refused('PERMISSION_DENIED');

        expect(screen.getByText('chat.attach.permission.microphoneTitle')).toBeInTheDocument();
        await act(async () => void fireEvent.click(screen.getByText('chat.attach.permission.settings')));
        expect(openSettings).toHaveBeenCalled();
    });

    it('sends what was recorded when the shell stops at the limit, and ignores the release after', async () => {
        const fake = fakeRecorder();
        const sendImages = jest.fn(async () => undefined);
        render(<Harness recorder={fake.recorder} sendImages={sendImages} />);

        await press();
        await fake.started();
        await fake.push({ reason: 'MAX_DURATION', file: recording, durationMs: 300_000 });
        await lift();

        expect(sendImages).toHaveBeenCalledTimes(1);
        expect(fake.recorder.stop).not.toHaveBeenCalled();
    });

    it('says the recording stopped when the shell was interrupted', async () => {
        const fake = fakeRecorder();
        const sendImages = jest.fn(async () => undefined);
        render(<Harness recorder={fake.recorder} sendImages={sendImages} />);

        await press();
        await fake.started();
        await fake.push({ reason: 'INTERRUPTED' });

        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.voice.interrupted' });
        expect(sendImages).not.toHaveBeenCalled();
    });

    it('throws a running recording away when the conversation changes', async () => {
        const fake = fakeRecorder();
        const sendImages = jest.fn(async () => undefined);
        const { rerender } = render(<Harness recorder={fake.recorder} sendImages={sendImages} scope="c1" />);

        await press();
        await fake.started();
        await act(async () => void rerender(<Harness recorder={fake.recorder} sendImages={sendImages} scope="c2" />));

        expect(fake.recorder.stop).toHaveBeenCalledWith('cancel');
        expect(screen.getByTestId('recording')).toHaveTextContent('false');
    });

    it('leaves the recording to the finger that pressed: another one lifting ends nothing', async () => {
        const fake = fakeRecorder();
        render(<Harness recorder={fake.recorder} sendImages={jest.fn()} />);

        await press();
        await fake.started();
        await lift(2);

        expect(fake.recorder.stop).not.toHaveBeenCalled();
        expect(screen.getByTestId('recording')).toHaveTextContent('true');
    });

    it('throws the recording away when typing puts the send button where the microphone was', async () => {
        const fake = fakeRecorder();
        const sendImages = jest.fn(async () => undefined);
        const { rerender } = render(<Harness recorder={fake.recorder} sendImages={sendImages} />);

        await press();
        await fake.started();
        await act(async () => void rerender(<Harness recorder={fake.recorder} sendImages={sendImages} typed />));

        expect(fake.recorder.stop).toHaveBeenCalledWith('cancel');
        expect(sendImages).not.toHaveBeenCalled();
    });
});
