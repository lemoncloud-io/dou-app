import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { isVoiceMessageName, MessageAudioCard } from './MessageAudioCard';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
    }),
}));

const props = {
    src: 'https://s/a.m4a?sig=1',
    download: 'idle' as const,
    onSave: jest.fn(),
    onCancel: jest.fn(),
};

const audio = () => document.querySelector('audio') as HTMLAudioElement;

describe('isVoiceMessageName', () => {
    it('knows a recording by the name the shell gives it, and nothing else', () => {
        expect(isVoiceMessageName('voice-20261102-101500.m4a')).toBe(true);
        expect(isVoiceMessageName('voice-memo.m4a')).toBe(false);
        expect(isVoiceMessageName('song.mp3')).toBe(false);
        expect(isVoiceMessageName(undefined)).toBe(false);
    });
});

describe('MessageAudioCard', () => {
    it('names a recording "Voice message" and any other file by its own name', () => {
        const { rerender } = render(<MessageAudioCard {...props} name="voice-20261102-101500.m4a" />);
        expect(screen.getByText('chat.attach.audio.voiceMessage')).toBeInTheDocument();

        rerender(<MessageAudioCard {...props} name="song.mp3" />);
        expect(screen.getByText('song.mp3')).toBeInTheDocument();
    });

    it('reads only the header until played, from the signed address', () => {
        render(<MessageAudioCard {...props} name="song.mp3" />);

        expect(audio()).toHaveAttribute('preload', 'metadata');
        expect(audio()).toHaveAttribute('src', props.src);
    });

    it('shows the length once the header names it', () => {
        render(<MessageAudioCard {...props} name="song.mp3" />);
        expect(screen.getByText('0:00')).toBeInTheDocument();

        Object.defineProperty(audio(), 'duration', { value: 8.4, configurable: true });
        act(() => void fireEvent.durationChange(audio()));

        expect(screen.getByText('0:00 / 0:08')).toBeInTheDocument();
    });

    it('says it cannot play a file the system does not decode, keeps the menu, and tells the host', () => {
        const onError = jest.fn();
        render(<MessageAudioCard {...props} name="take.ogg" onError={onError} />);

        act(() => void fireEvent.error(audio()));

        expect(screen.getByText('chat.attach.audio.playFailed')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /chat\.attach\.audio\.play:/ })).toBeDisabled();
        expect(screen.getByRole('button', { name: /chat\.attach\.audio\.menu/ })).toBeInTheDocument();
        expect(onError).toHaveBeenCalled();
    });

    it('turns its menu into a cancel while the save downloads', () => {
        render(<MessageAudioCard {...props} name="song.mp3" download="downloading" />);

        fireEvent.click(screen.getByRole('button', { name: /chat\.attach\.fileCard\.cancel/ }));

        expect(props.onCancel).toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: /chat\.attach\.audio\.menu/ })).not.toBeInTheDocument();
    });

    it('has no menu where it can neither be saved nor shared', () => {
        render(<MessageAudioCard {...props} name="song.mp3" download="unavailable" />);

        expect(screen.queryByRole('button', { name: /chat\.attach\.audio\.menu/ })).not.toBeInTheDocument();
    });
});
