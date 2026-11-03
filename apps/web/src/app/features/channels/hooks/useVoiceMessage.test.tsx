import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

import type { OnAudioRecordingEndedPayload } from '@chatic/bridge-messages';
import type { ChatAttachmentSource } from '@chatic/data';

import type { audioRecorder, StartRecordingResult } from '../../../bridge/audioRecorder';
import { useVoiceMessage } from './useVoiceMessage';

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
}: {
    recorder: typeof audioRecorder;
    sendImages: (files: ChatAttachmentSource[]) => Promise<void>;
    canRecord?: boolean;
    disabled?: boolean;
    scope?: string;
}) => {
    const voice = useVoiceMessage({ sendImages, recorder, canRecord, disabled, scope, now });
    return (
        <div>
            {/* The attach panel's voice entry. */}
            <button type="button" onClick={voice.open}>
                voice-entry
            </button>
            <span data-testid="can-record">{String(voice.canRecord)}</span>
            {voice.sheet}
        </div>
    );
};

const openSheet = () => act(async () => fireEvent.click(screen.getByText('voice-entry')));
const sheetTitle = () => screen.queryByText('chat.attach.voice.title');
const recordButton = () => screen.queryByRole('button', { name: 'chat.attach.voice.record' });
const tapRecord = () =>
    act(async () => fireEvent.click(screen.getByRole('button', { name: 'chat.attach.voice.record' })));
const tap = (label: string) => act(async () => fireEvent.click(screen.getByRole('button', { name: label })));
const sendButton = () => screen.queryByRole('button', { name: 'chat.attach.voice.send' });

describe('useVoiceMessage', () => {
    beforeEach(() => {
        clock = 0;
        toast.mockReset();
        openSettings.mockReset();
    });

    it('offers no entry where the app does not record, nor on a locked composer', async () => {
        const { recorder } = fakeRecorder();
        const { rerender } = render(<Harness recorder={recorder} sendImages={jest.fn()} canRecord={false} />);
        expect(screen.getByTestId('can-record')).toHaveTextContent('false');
        await openSheet();
        expect(sheetTitle()).not.toBeInTheDocument();

        rerender(<Harness recorder={recorder} sendImages={jest.fn()} disabled />);
        expect(screen.getByTestId('can-record')).toHaveTextContent('false');
    });

    it('records from a tap and sends the file with Send, typed audio/mp4, closing the sheet', async () => {
        const fake = fakeRecorder();
        fake.recorder.stop.mockResolvedValue({ reason: 'SENT', file: recording, durationMs: 8_000 });
        const sendImages = jest.fn(async () => undefined);
        render(<Harness recorder={fake.recorder} sendImages={sendImages} />);

        await openSheet();
        expect(sheetTitle()).toBeInTheDocument();
        expect(sendButton()).not.toBeInTheDocument();

        await tapRecord();
        expect(fake.recorder.start).toHaveBeenCalledTimes(1);
        await fake.started(1_000);
        expect(recordButton()).not.toBeInTheDocument();
        expect(screen.getByText('chat.attach.voice.recordingHint')).toBeInTheDocument();

        clock = 9_000;
        await tap('chat.attach.voice.send');

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
        expect(sheetTitle()).not.toBeInTheDocument();
    });

    it('throws the recording away with Cancel and closes the sheet', async () => {
        const fake = fakeRecorder();
        const sendImages = jest.fn(async () => undefined);
        render(<Harness recorder={fake.recorder} sendImages={sendImages} />);

        await openSheet();
        await tapRecord();
        await fake.started();
        await tap('chat.attach.voice.cancel');

        expect(fake.recorder.stop).toHaveBeenCalledWith('cancel');
        expect(sendImages).not.toHaveBeenCalled();
        expect(toast).not.toHaveBeenCalled();
        expect(sheetTitle()).not.toBeInTheDocument();
    });

    it('keeps the sheet through Escape while it records: only its buttons end a recording', async () => {
        const fake = fakeRecorder();
        render(<Harness recorder={fake.recorder} sendImages={jest.fn()} />);

        await openSheet();
        await tapRecord();
        await fake.started();
        await act(async () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' }));

        expect(fake.recorder.stop).not.toHaveBeenCalled();
        expect(sendButton()).toBeInTheDocument();
    });

    it('lets a Send already on its way finish when × is tapped after it', async () => {
        const fake = fakeRecorder();
        let answer: (ended: OnAudioRecordingEndedPayload) => void = () => undefined;
        fake.recorder.stop.mockImplementation(
            () =>
                new Promise<OnAudioRecordingEndedPayload | null>(resolve => {
                    answer = resolve;
                })
        );
        const sendImages = jest.fn(async () => undefined);
        render(<Harness recorder={fake.recorder} sendImages={sendImages} />);

        await openSheet();
        await tapRecord();
        await fake.started();
        await tap('chat.attach.voice.send');
        await tap('common.close');
        await act(async () => answer({ reason: 'SENT', file: recording, durationMs: 4_000 }));

        expect(fake.recorder.stop).toHaveBeenCalledTimes(1);
        expect(sendImages).toHaveBeenCalledTimes(1);
        expect(sheetTitle()).not.toBeInTheDocument();
    });

    it('stops what the shell started when the sheet closed before it answered', async () => {
        const fake = fakeRecorder();
        const sendImages = jest.fn(async () => undefined);
        render(<Harness recorder={fake.recorder} sendImages={sendImages} />);

        await openSheet();
        await tapRecord();
        // The header's × while the shell is still starting.
        await tap('common.close');
        await fake.started();

        expect(fake.recorder.stop).toHaveBeenCalledWith('cancel');
        expect(sendImages).not.toHaveBeenCalled();
        expect(sheetTitle()).not.toBeInTheDocument();
    });

    it('says to record longer when the shell kept nothing under a second, and stays open', async () => {
        const fake = fakeRecorder();
        fake.recorder.stop.mockResolvedValue({ reason: 'TOO_SHORT' });
        const sendImages = jest.fn(async () => undefined);
        render(<Harness recorder={fake.recorder} sendImages={sendImages} />);

        await openSheet();
        await tapRecord();
        await fake.started();
        await tap('chat.attach.voice.send');

        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.voice.tooShort' });
        expect(sendImages).not.toHaveBeenCalled();
        expect(recordButton()).toBeInTheDocument();
    });

    it('offers the way to Settings when the microphone is refused', async () => {
        const fake = fakeRecorder();
        render(<Harness recorder={fake.recorder} sendImages={jest.fn()} />);

        await openSheet();
        await tapRecord();
        await fake.refused('PERMISSION_DENIED');

        expect(sheetTitle()).not.toBeInTheDocument();
        await tap('chat.attach.permission.settings');
        expect(openSettings).toHaveBeenCalledTimes(1);
    });

    it('says the recorder failed when the shell could not start', async () => {
        const fake = fakeRecorder();
        render(<Harness recorder={fake.recorder} sendImages={jest.fn()} />);

        await openSheet();
        await tapRecord();
        await fake.refused('BUSY');

        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.voice.failed', variant: 'destructive' });
        expect(recordButton()).toBeInTheDocument();
    });

    it('sends what was recorded when the shell stops at the limit, and closes', async () => {
        const fake = fakeRecorder();
        const sendImages = jest.fn(async () => undefined);
        render(<Harness recorder={fake.recorder} sendImages={sendImages} />);

        await openSheet();
        await tapRecord();
        await fake.started();
        await fake.push({ reason: 'MAX_DURATION', file: recording, durationMs: 300_000 });

        expect(sendImages).toHaveBeenCalledTimes(1);
        expect(sheetTitle()).not.toBeInTheDocument();
    });

    it('says the recording stopped when the shell was interrupted, and lets it record again', async () => {
        const fake = fakeRecorder();
        const sendImages = jest.fn(async () => undefined);
        render(<Harness recorder={fake.recorder} sendImages={sendImages} />);

        await openSheet();
        await tapRecord();
        await fake.started();
        await fake.push({ reason: 'INTERRUPTED' });

        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.voice.interrupted' });
        expect(sendImages).not.toHaveBeenCalled();
        expect(recordButton()).toBeInTheDocument();
    });

    it('throws a running recording away and closes when the conversation changes', async () => {
        const fake = fakeRecorder();
        const sendImages = jest.fn(async () => undefined);
        const { rerender } = render(<Harness recorder={fake.recorder} sendImages={sendImages} scope="c1" />);

        await openSheet();
        await tapRecord();
        await fake.started();
        await act(async () => void rerender(<Harness recorder={fake.recorder} sendImages={sendImages} scope="c2" />));

        expect(fake.recorder.stop).toHaveBeenCalledWith('cancel');
        expect(sendImages).not.toHaveBeenCalled();
        expect(sheetTitle()).not.toBeInTheDocument();
    });

    it('throws a running recording away when the composer locks', async () => {
        const fake = fakeRecorder();
        const sendImages = jest.fn(async () => undefined);
        const { rerender } = render(<Harness recorder={fake.recorder} sendImages={sendImages} />);

        await openSheet();
        await tapRecord();
        await fake.started();
        await act(async () => void rerender(<Harness recorder={fake.recorder} sendImages={sendImages} disabled />));

        expect(fake.recorder.stop).toHaveBeenCalledWith('cancel');
        expect(sheetTitle()).not.toBeInTheDocument();
    });
});
