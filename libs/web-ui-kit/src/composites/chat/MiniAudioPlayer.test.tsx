import { fireEvent, render, screen } from '@testing-library/react';

import { MiniAudioPlayer } from './MiniAudioPlayer';

const base = { name: 'Recording 8.m4a', onToggle: jest.fn(), onClose: jest.fn() };

describe('MiniAudioPlayer', () => {
    it('builds the line from the sender and the clock', () => {
        render(<MiniAudioPlayer {...base} playing sender="Alex" position={723} duration={2147} />);
        expect(screen.getByText('Recording 8.m4a')).toBeInTheDocument();
        expect(screen.getByText('Alex · 12:03 / 35:47')).toBeInTheDocument();
    });

    it("draws the host's own line in place of the built one", () => {
        render(<MiniAudioPlayer {...base} playing sender="Alex" duration={10} subtitle="From the archive" />);
        expect(screen.getByText('From the archive')).toBeInTheDocument();
        expect(screen.queryByText(/Alex/)).not.toBeInTheDocument();
    });

    it('leaves the clock out while the length is unknown', () => {
        render(<MiniAudioPlayer {...base} playing={false} sender="Alex" />);
        expect(screen.getByText('Alex')).toBeInTheDocument();
    });

    it('plays, pauses, changes speed and closes', () => {
        const onToggle = jest.fn();
        const onClose = jest.fn();
        const onRateChange = jest.fn();
        const { rerender } = render(
            <MiniAudioPlayer
                {...base}
                playing
                onToggle={onToggle}
                onClose={onClose}
                onRateChange={onRateChange}
                rate={1.5}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
        expect(onToggle).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Playback speed 1.5x' }));
        expect(onRateChange).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Close player' }));
        expect(onClose).toHaveBeenCalledTimes(1);

        rerender(<MiniAudioPlayer {...base} playing={false} onToggle={onToggle} onClose={onClose} />);
        expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    });

    it('opens from the body only when the host handles it', () => {
        const onPress = jest.fn();
        const { rerender } = render(<MiniAudioPlayer {...base} playing />);
        expect(screen.queryByRole('button', { name: /Recording 8/ })).not.toBeInTheDocument();

        rerender(<MiniAudioPlayer {...base} playing onPress={onPress} />);
        fireEvent.click(screen.getByRole('button', { name: /Recording 8/ }));
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('takes its labels from the host', () => {
        render(<MiniAudioPlayer {...base} playing={false} playLabel="재생" closeLabel="닫기" rateLabel="배속" />);
        expect(screen.getByRole('button', { name: '재생' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '배속 1x' })).toBeInTheDocument();
    });
});
