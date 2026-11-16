import { fireEvent, render, screen } from '@testing-library/react';

import { AudioMessageBubble } from './AudioMessageBubble';

const NAME = 'Recording 8.m4a';

describe('AudioMessageBubble', () => {
    it('shows the name and the meta line before it plays, and plays on the button', () => {
        const onToggle = jest.fn();
        render(<AudioMessageBubble side="other" state="idle" name={NAME} meta="35:47 · 17.0MB" onToggle={onToggle} />);

        expect(screen.getByText('35:47 · 17.0MB')).toBeInTheDocument();
        // The name is read once, whole, rather than as its two drawn halves.
        expect(screen.getByText(NAME)).toHaveClass('sr-only');
        fireEvent.click(screen.getByRole('button', { name: 'Play' }));
        expect(onToggle).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    });

    it('keeps the extension apart from the part that is cut short', () => {
        render(<AudioMessageBubble side="mine" state="idle" name={NAME} />);
        expect(screen.getByText('Recording 8')).toHaveClass('truncate');
        expect(screen.getByText('.m4a')).toHaveClass('shrink-0');
    });

    it('draws the seek bar, the clock and the speed while playing', () => {
        const onToggle = jest.fn();
        const onSeek = jest.fn();
        const onRateChange = jest.fn();
        render(
            <AudioMessageBubble
                side="mine"
                state="playing"
                name={NAME}
                position={723}
                duration={2147}
                rate={1.5}
                onToggle={onToggle}
                onSeek={onSeek}
                onRateChange={onRateChange}
            />
        );

        expect(screen.getByText('12:03 / 35:47')).toBeInTheDocument();
        const slider = screen.getByRole('slider', { name: 'Seek' });
        expect(slider).toHaveAttribute('aria-valuetext', '12:03 / 35:47');

        fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
        expect(onToggle).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Playback speed 1.5x' }));
        expect(onRateChange).toHaveBeenCalledTimes(1);

        fireEvent.change(slider, { target: { value: '100' } });
        expect(onSeek).toHaveBeenCalledWith(100);
    });

    it('shows where a drag would land in the clock before it seeks', () => {
        const onSeek = jest.fn();
        render(
            <AudioMessageBubble side="other" state="paused" name={NAME} position={0} duration={2147} onSeek={onSeek} />
        );
        const slider = screen.getByRole('slider');
        expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();

        fireEvent.pointerDown(slider);
        fireEvent.change(slider, { target: { value: '600' } });
        expect(screen.getByText('10:00 / 35:47')).toBeInTheDocument();
        expect(onSeek).not.toHaveBeenCalled();

        fireEvent.pointerUp(slider);
        expect(onSeek).toHaveBeenCalledWith(600);
        // The preview ends with the drag; the clock goes back to the host's position.
        expect(screen.getByText('0:00 / 35:47')).toBeInTheDocument();
    });

    it('turns a spinner while the audio loads, and the button still stops it', () => {
        const onToggle = jest.fn();
        render(<AudioMessageBubble side="other" state="loading" name={NAME} meta="35:47" onToggle={onToggle} />);
        const button = screen.getByRole('button', { name: 'Pause' });
        expect(button).toHaveAttribute('aria-busy', 'true');
        fireEvent.click(button);
        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('fills a ring while sending and cancels from the × inside it', () => {
        const onCancelSend = jest.fn();
        render(
            <AudioMessageBubble
                side="mine"
                state="sending"
                name={NAME}
                sendProgress={0.42}
                sendingText="7.1 MB / 17.0 MB"
                onCancelSend={onCancelSend}
                onOpen={jest.fn()}
            />
        );

        const progress = screen.getByRole('progressbar', { name: NAME });
        expect(progress).toHaveAttribute('aria-valuenow', '42');
        expect(screen.getByText('7.1 MB / 17.0 MB')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel upload' }));
        expect(onCancelSend).toHaveBeenCalledTimes(1);
        // Nothing is stored yet, so there is nothing to open.
        expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();
    });

    it('turns the ring with no value while the upload has not reported a total', () => {
        render(<AudioMessageBubble side="mine" state="sending" name={NAME} />);
        expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    });

    it('marks a failed send in red with an English default line', () => {
        render(<AudioMessageBubble side="mine" state="failed" name={NAME} />);
        expect(screen.getByTestId('audio-failed-mark')).toHaveClass('bg-alert-red');
        expect(screen.getByText('Failed to send')).toHaveClass('text-alert-red');
        expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument();
    });

    it('draws a waveform with no button for a broken file', () => {
        render(<AudioMessageBubble side="other" state="broken" name={NAME} onDownload={jest.fn()} />);
        expect(screen.getByTestId('audio-wave-mark')).toHaveClass('bg-control-idle');
        expect(screen.getByText('This file cannot be played')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument();
    });

    it('offers a download for a format this device cannot play', () => {
        const onDownload = jest.fn();
        render(
            <AudioMessageBubble
                side="mine"
                state="unsupported"
                name={NAME}
                unsupportedText="Unsupported format · 17.0MB"
                onDownload={onDownload}
            />
        );
        expect(screen.getByText('Unsupported format · 17.0MB')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Download' }));
        expect(onDownload).toHaveBeenCalledTimes(1);
    });

    it('opens from the body without the controls opening it too', () => {
        const onOpen = jest.fn();
        const onToggle = jest.fn();
        render(<AudioMessageBubble side="other" state="idle" name={NAME} onOpen={onOpen} onToggle={onToggle} />);

        fireEvent.click(screen.getByRole('button', { name: 'Play' }));
        expect(onToggle).toHaveBeenCalledTimes(1);
        expect(onOpen).not.toHaveBeenCalled();

        const open = screen.getByRole('button', { name: 'Open' });
        expect(open).toHaveAccessibleDescription(NAME);
        fireEvent.click(open);
        expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('lets a press reach the host row, which owns the long press', () => {
        const onPointerDown = jest.fn();
        render(
            <div onPointerDown={onPointerDown}>
                <AudioMessageBubble side="other" state="idle" name={NAME} onOpen={jest.fn()} onToggle={jest.fn()} />
            </div>
        );
        fireEvent.pointerDown(screen.getByRole('button', { name: 'Open' }));
        fireEvent.pointerDown(screen.getByRole('button', { name: 'Play' }));
        expect(onPointerDown).toHaveBeenCalledTimes(2);
    });

    it('takes its labels from the host', () => {
        render(
            <AudioMessageBubble
                side="mine"
                state="playing"
                name={NAME}
                duration={60}
                pauseLabel="일시정지"
                seekLabel="재생 위치"
                rateLabel="배속"
                rate={2}
                onOpen={jest.fn()}
                openLabel="열기"
            />
        );
        expect(screen.getByRole('button', { name: '일시정지' })).toBeInTheDocument();
        expect(screen.getByRole('slider', { name: '재생 위치' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '배속 2x' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '열기' })).toBeInTheDocument();
    });

    it('takes the ground of its side', () => {
        const { container, rerender } = render(<AudioMessageBubble side="mine" state="idle" name={NAME} />);
        expect(container.firstChild).toHaveClass('bg-bubble-mine');
        rerender(<AudioMessageBubble side="other" state="idle" name={NAME} />);
        expect(container.firstChild).toHaveClass('bg-bubble-other');
    });
});
