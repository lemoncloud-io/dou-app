import { fireEvent, render, screen } from '@testing-library/react';

import { AudioSeekBar } from './AudioSeekBar';

describe('AudioSeekBar', () => {
    it('fills up to the played part and names itself', () => {
        render(<AudioSeekBar value={30} max={120} onSeek={jest.fn()} label="Seek voice" valueText="0:30 / 2:00" />);
        const slider = screen.getByRole('slider', { name: 'Seek voice' });
        expect(slider).toHaveAttribute('aria-valuetext', '0:30 / 2:00');
        expect(screen.getByTestId('seek-fill')).toHaveStyle({ width: '25%' });
    });

    it('seeks at once on a tap or key', () => {
        const onSeek = jest.fn();
        render(<AudioSeekBar value={0} max={100} onSeek={onSeek} />);
        fireEvent.change(screen.getByRole('slider'), { target: { value: '40' } });
        expect(onSeek).toHaveBeenCalledWith(40);
    });

    it('reports the drag position and seeks once when the drag ends', () => {
        const onSeek = jest.fn();
        const onScrub = jest.fn();
        render(<AudioSeekBar value={0} max={100} onSeek={onSeek} onScrub={onScrub} />);
        const slider = screen.getByRole('slider');
        fireEvent.pointerDown(slider);
        fireEvent.change(slider, { target: { value: '20' } });
        fireEvent.change(slider, { target: { value: '60' } });
        expect(onScrub).toHaveBeenLastCalledWith(60);
        expect(onSeek).not.toHaveBeenCalled();
        expect(screen.getByTestId('seek-fill')).toHaveStyle({ width: '60%' });

        fireEvent.pointerUp(slider);
        expect(onSeek).toHaveBeenCalledTimes(1);
        expect(onSeek).toHaveBeenCalledWith(60);
        expect(onScrub).toHaveBeenLastCalledWith(null);
    });

    it('rests empty and disabled while the length is unknown', () => {
        render(<AudioSeekBar value={10} max={undefined} onSeek={jest.fn()} />);
        expect(screen.getByRole('slider')).toBeDisabled();
        expect(screen.getByTestId('seek-fill')).toHaveStyle({ width: '0%' });
    });

    it('colours for a dark or light ground', () => {
        const { rerender } = render(<AudioSeekBar value={1} max={2} onSeek={jest.fn()} tone="onDark" />);
        expect(screen.getByTestId('seek-fill')).toHaveClass('bg-bubble-mine-foreground');
        rerender(<AudioSeekBar value={1} max={2} onSeek={jest.fn()} tone="onLight" />);
        expect(screen.getByTestId('seek-fill')).toHaveClass('bg-brand-ink');
    });
});
