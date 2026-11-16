import { fireEvent, render, screen } from '@testing-library/react';

import { AudioDetailLayout, type AudioDetailLayoutProps } from './AudioDetailLayout';

const setup = (overrides: Partial<AudioDetailLayoutProps> = {}) => {
    const props: AudioDetailLayoutProps = {
        senderName: 'Friend',
        sentAt: '2026. 11. 11. 6:33 PM',
        onBack: jest.fn(),
        name: 'New recording 8.m4a',
        meta: '35:47 · 17.0MB',
        playing: false,
        position: 0,
        duration: 2147,
        rate: 1,
        onToggle: jest.fn(),
        onSeek: jest.fn(),
        onSkip: jest.fn(),
        onRateChange: jest.fn(),
        actions: [],
        ...overrides,
    };
    render(<AudioDetailLayout {...props} />);
    return props;
};

describe('AudioDetailLayout', () => {
    it('shows the sender, the sent time, the file name and its meta', () => {
        setup({ waveform: <div data-testid="wave" /> });
        expect(screen.getByText('Friend')).toBeInTheDocument();
        expect(screen.getByText('2026. 11. 11. 6:33 PM')).toBeInTheDocument();
        expect(screen.getByText('New recording 8.m4a')).toBeInTheDocument();
        expect(screen.getByText('35:47 · 17.0MB')).toBeInTheDocument();
        expect(screen.getByTestId('wave')).toBeInTheDocument();
    });

    it('goes back and opens the collection', () => {
        const onCollection = jest.fn();
        const props = setup({ onCollection });
        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        fireEvent.click(screen.getByRole('button', { name: 'Files' }));
        expect(props.onBack).toHaveBeenCalledTimes(1);
        expect(onCollection).toHaveBeenCalledTimes(1);
    });

    it('hides the collection button without a handler', () => {
        setup();
        expect(screen.queryByRole('button', { name: 'Files' })).toBeNull();
    });

    it('makes the sent time pressable only when it has somewhere to go', () => {
        const onSentAtPress = jest.fn();
        setup({ onSentAtPress });
        fireEvent.click(screen.getByRole('button', { name: '2026. 11. 11. 6:33 PM' }));
        expect(onSentAtPress).toHaveBeenCalledTimes(1);
    });

    it('draws the sent time as plain text without a handler', () => {
        setup();
        expect(screen.queryByRole('button', { name: '2026. 11. 11. 6:33 PM' })).toBeNull();
    });

    it('reads the whole length before anything has played', () => {
        setup({ position: 0, playing: false });
        expect(screen.getByTestId('audio-elapsed')).toHaveTextContent('0:00');
        expect(screen.getByTestId('audio-remaining')).toHaveTextContent('35:47');
        expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    });

    it('counts down what is left while playing', () => {
        setup({ position: 723, playing: true });
        expect(screen.getByTestId('audio-elapsed')).toHaveTextContent('12:03');
        expect(screen.getByTestId('audio-remaining')).toHaveTextContent('-23:44');
        expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    });

    it('shows the time under a drag before seeking, then seeks once', () => {
        const props = setup({ position: 0, playing: true });
        const slider = screen.getByRole('slider', { name: 'Seek' });
        fireEvent.pointerDown(slider);
        fireEvent.change(slider, { target: { value: '600' } });
        expect(screen.getByTestId('audio-elapsed')).toHaveTextContent('10:00');
        expect(screen.getByTestId('audio-remaining')).toHaveTextContent('-25:47');
        expect(props.onSeek).not.toHaveBeenCalled();
        fireEvent.pointerUp(slider);
        expect(props.onSeek).toHaveBeenCalledWith(600);
    });

    it('toggles, skips 15 seconds each way and changes speed', () => {
        const props = setup({ rate: 1.5 });
        fireEvent.click(screen.getByRole('button', { name: 'Play' }));
        fireEvent.click(screen.getByRole('button', { name: 'Back 15 seconds' }));
        fireEvent.click(screen.getByRole('button', { name: 'Forward 15 seconds' }));
        fireEvent.click(screen.getByRole('button', { name: 'Playback speed 1.5x' }));
        expect(props.onToggle).toHaveBeenCalledTimes(1);
        expect(props.onSkip).toHaveBeenNthCalledWith(1, -15);
        expect(props.onSkip).toHaveBeenNthCalledWith(2, 15);
        expect(props.onRateChange).toHaveBeenCalledTimes(1);
    });

    it('cannot be toggled while loading', () => {
        const props = setup({ loading: true });
        const button = screen.getByRole('button', { name: 'Loading' });
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('aria-busy', 'true');
        fireEvent.click(button);
        expect(props.onToggle).not.toHaveBeenCalled();
    });

    it('cannot seek or skip while the length is unknown', () => {
        setup({ duration: undefined });
        expect(screen.getByRole('slider')).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Back 15 seconds' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Forward 15 seconds' })).toBeDisabled();
        expect(screen.getByTestId('audio-remaining')).toBeEmptyDOMElement();
    });

    it('draws each action and honours disabled and busy', () => {
        const onSave = jest.fn();
        const onShare = jest.fn();
        const onMore = jest.fn();
        setup({
            actions: [
                { key: 'save', icon: <svg />, label: 'Save', onPress: onSave },
                { key: 'share', icon: <svg />, label: 'Share', onPress: onShare, busy: true },
                { key: 'more', icon: <svg />, label: 'More', onPress: onMore, disabled: true },
            ],
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
        fireEvent.click(screen.getByRole('button', { name: 'More' }));
        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onShare).not.toHaveBeenCalled();
        expect(onMore).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Share' })).toHaveAttribute('aria-busy', 'true');
    });

    it('takes translated labels', () => {
        setup({ labels: { back: '뒤로', play: '재생' } });
        expect(screen.getByRole('button', { name: '뒤로' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '재생' })).toBeInTheDocument();
    });
});
