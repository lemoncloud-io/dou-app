import { fireEvent, render, screen } from '@testing-library/react';

import { formatPlaybackRate, PlaybackRateChip } from './PlaybackRateChip';

describe('PlaybackRateChip', () => {
    it('shows the speed and reports a press', () => {
        const onPress = jest.fn();
        render(<PlaybackRateChip rate={1.5} onPress={onPress} label="Speed" />);
        const chip = screen.getByRole('button', { name: 'Speed 1.5x' });
        expect(chip).toHaveTextContent('1.5x');
        fireEvent.click(chip);
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('formats whole and fractional speeds', () => {
        expect(formatPlaybackRate(1)).toBe('1x');
        expect(formatPlaybackRate(2)).toBe('2x');
        expect(formatPlaybackRate(1.5)).toBe('1.5x');
    });

    it('takes the tone of its ground', () => {
        const { rerender } = render(<PlaybackRateChip rate={1} onPress={jest.fn()} tone="onDark" />);
        expect(screen.getByRole('button')).toHaveClass('text-bubble-mine-foreground');
        rerender(<PlaybackRateChip rate={1} onPress={jest.fn()} tone="outline" />);
        expect(screen.getByRole('button')).toHaveClass('border-input-border');
    });
});
