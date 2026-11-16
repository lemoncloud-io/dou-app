import { fireEvent, render, screen } from '@testing-library/react';

import { decorativeWaveform, Waveform } from './Waveform';

/** jsdom lays nothing out, so give the row a 200px box starting at x = 100. */
const stubBox = (element: HTMLElement) => {
    element.getBoundingClientRect = () =>
        ({ left: 100, top: 0, width: 200, height: 140, right: 300, bottom: 140, x: 100, y: 0 }) as DOMRect;
};

/**
 * jsdom has no `PointerEvent`, so `fireEvent.pointerDown` would dispatch a bare `Event` with no
 * coordinates. A `MouseEvent` under the pointer type name carries `clientX`, and React listens by name.
 */
const pointer = (type: string, element: HTMLElement, clientX: number, pointerId = 1) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX });
    Object.defineProperty(event, 'pointerId', { value: pointerId });
    fireEvent(element, event);
};

describe('decorativeWaveform', () => {
    it('draws the same shape for the same seed', () => {
        expect(decorativeWaveform('voice-1')).toEqual(decorativeWaveform('voice-1'));
    });

    it('draws a different shape for a different seed', () => {
        expect(decorativeWaveform('voice-1')).not.toEqual(decorativeWaveform('voice-2'));
    });

    it('keeps every height inside (0, 1]', () => {
        for (const seed of ['', 'a', 'voice-file-123', '새로운 녹음 8.m4a']) {
            for (const height of decorativeWaveform(seed)) {
                expect(height).toBeGreaterThan(0);
                expect(height).toBeLessThanOrEqual(1);
            }
        }
    });

    it('returns 48 bars by default and the count asked for otherwise', () => {
        expect(decorativeWaveform('x')).toHaveLength(48);
        expect(decorativeWaveform('x', 33)).toHaveLength(33);
        expect(decorativeWaveform('x', 0)).toHaveLength(0);
    });
});

describe('Waveform', () => {
    it('draws the bars it is given and colours the played ones', () => {
        render(<Waveform bars={[0.2, 0.5, 1, 0.5]} progress={0.5} />);
        const bars = screen.getAllByTestId('waveform-bar');
        expect(bars).toHaveLength(4);
        expect(bars.map(bar => bar.dataset.played === 'true')).toEqual([true, true, false, false]);
        expect(bars[0]).toHaveClass('bg-brand-ink');
        expect(bars[3]).toHaveClass('bg-control-idle');
        expect(bars[2]).toHaveStyle({ height: '100%' });
    });

    it('colours the bar the playhead has entered', () => {
        render(<Waveform bars={[1, 1, 1, 1]} progress={0.3} />);
        const played = screen.getAllByTestId('waveform-bar').filter(bar => bar.dataset.played === 'true');
        expect(played).toHaveLength(2);
    });

    it('draws the decorative shape from the seed while no bars are given', () => {
        render(<Waveform seed="voice-1" progress={0} />);
        const bars = screen.getAllByTestId('waveform-bar');
        expect(bars).toHaveLength(48);
        expect(bars.every(bar => bar.dataset.played === undefined)).toBe(true);
    });

    it('is a picture, not a slider, without onSeek', () => {
        render(<Waveform bars={[1]} progress={0} />);
        expect(screen.queryByRole('slider')).toBeNull();
        expect(screen.getByRole('img', { name: 'Waveform' })).toBeInTheDocument();
    });

    it('is a named slider with a percentage value when it can seek', () => {
        render(<Waveform bars={[1, 1]} progress={0.337} onSeek={jest.fn()} label="Voice waveform" />);
        const slider = screen.getByRole('slider', { name: 'Voice waveform' });
        expect(slider).toHaveAttribute('aria-valuenow', '34');
        expect(slider).toHaveAttribute('aria-valuemin', '0');
        expect(slider).toHaveAttribute('aria-valuemax', '100');
    });

    it('steps 5% with the arrow keys and clamps at the ends', () => {
        const onSeek = jest.fn();
        const { rerender } = render(<Waveform bars={[1]} progress={0.5} onSeek={onSeek} />);
        const slider = screen.getByRole('slider');
        fireEvent.keyDown(slider, { key: 'ArrowRight' });
        expect(onSeek).toHaveBeenLastCalledWith(0.55);
        fireEvent.keyDown(slider, { key: 'ArrowLeft' });
        expect(onSeek).toHaveBeenLastCalledWith(0.45);

        rerender(<Waveform bars={[1]} progress={0.98} onSeek={onSeek} />);
        fireEvent.keyDown(slider, { key: 'ArrowRight' });
        expect(onSeek).toHaveBeenLastCalledWith(1);

        onSeek.mockClear();
        fireEvent.keyDown(slider, { key: 'a' });
        expect(onSeek).not.toHaveBeenCalled();
    });

    it('seeks to where a tap lands', () => {
        const onSeek = jest.fn();
        render(<Waveform bars={[1, 1, 1, 1]} progress={0} onSeek={onSeek} />);
        const slider = screen.getByRole('slider');
        stubBox(slider);
        pointer('pointerdown', slider, 150);
        pointer('pointerup', slider, 150);
        expect(onSeek).toHaveBeenCalledTimes(1);
        expect(onSeek).toHaveBeenCalledWith(0.25);
    });

    it('follows a drag and seeks once, when the finger lifts', () => {
        const onSeek = jest.fn();
        render(<Waveform bars={[1, 1, 1, 1]} progress={0} onSeek={onSeek} />);
        const slider = screen.getByRole('slider');
        stubBox(slider);
        pointer('pointerdown', slider, 110);
        pointer('pointermove', slider, 250);
        expect(onSeek).not.toHaveBeenCalled();
        expect(slider).toHaveAttribute('aria-valuenow', '75');

        // Past the row's end clamps to the end.
        pointer('pointermove', slider, 400);
        pointer('pointerup', slider, 400);
        expect(onSeek).toHaveBeenCalledTimes(1);
        expect(onSeek).toHaveBeenCalledWith(1);
        // The drag is over, so the host's progress is drawn again.
        expect(slider).toHaveAttribute('aria-valuenow', '0');
    });

    it('drops a cancelled drag without seeking', () => {
        const onSeek = jest.fn();
        render(<Waveform bars={[1, 1]} progress={0.1} onSeek={onSeek} />);
        const slider = screen.getByRole('slider');
        stubBox(slider);
        pointer('pointerdown', slider, 280);
        pointer('pointercancel', slider, 0);
        expect(onSeek).not.toHaveBeenCalled();
        expect(slider).toHaveAttribute('aria-valuenow', '10');
    });
});
