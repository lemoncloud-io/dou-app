import { render } from '@testing-library/react';

import { IconAudioWave } from './IconAudioWave';
import { IconPauseSolid } from './IconPauseSolid';
import { IconSkip15 } from './IconSkip15';

describe.each([
    ['IconPauseSolid', (size?: number) => <IconPauseSolid size={size} />, 20],
    ['IconAudioWave', (size?: number) => <IconAudioWave size={size} />, 20],
    ['IconSkip15', (size?: number) => <IconSkip15 size={size} direction="back" />, 24],
] as const)('%s', (_name, draw, defaultSize) => {
    it('renders a square svg hidden from assistive tech', () => {
        const { container } = render(draw());
        const svg = container.querySelector('svg');
        expect(svg).toHaveAttribute('width', String(defaultSize));
        expect(svg).toHaveAttribute('height', String(defaultSize));
        expect(svg).toHaveAttribute('aria-hidden', 'true');
    });

    it('follows size', () => {
        const { container } = render(draw(32));
        expect(container.querySelector('svg')).toHaveAttribute('width', '32');
    });
});

describe('IconSkip15', () => {
    it('mirrors the arrow for forward and keeps the number upright', () => {
        const { container, rerender } = render(<IconSkip15 direction="back" />);
        expect(container.querySelector('g')).not.toHaveAttribute('transform');
        rerender(<IconSkip15 direction="forward" />);
        expect(container.querySelector('g')).toHaveAttribute('transform', 'translate(24 0) scale(-1 1)');
        expect(container.querySelector('text')).toHaveTextContent('15');
    });
});
