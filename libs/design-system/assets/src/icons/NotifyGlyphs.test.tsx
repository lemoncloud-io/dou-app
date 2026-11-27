import { render } from '@testing-library/react';

import { IconCheckSmall, IconJumpArrow, IconThreadChip } from './NotifyGlyphs';

describe('NotifyGlyphs', () => {
    it.each([
        ['IconThreadChip', IconThreadChip],
        ['IconCheckSmall', IconCheckSmall],
        ['IconJumpArrow', IconJumpArrow],
    ])('%s is decorative, draws in currentColor and references no fragment url', (_name, Icon) => {
        const { container } = render(<Icon />);

        const svg = container.querySelector('svg');
        expect(svg).toHaveAttribute('aria-hidden', 'true');
        expect(container.querySelector('mask, clipPath, defs')).toBeNull();
        expect(container.innerHTML).not.toContain('url(#');
        container.querySelectorAll('path').forEach(path => expect(path).toHaveAttribute('stroke', 'currentColor'));
    });

    it('keeps the jump arrow at its 12×14 aspect ratio when resized', () => {
        const { container } = render(<IconJumpArrow size={24} />);

        const svg = container.querySelector('svg');
        expect(svg).toHaveAttribute('width', '24');
        expect(svg).toHaveAttribute('height', '28');
    });

    it('draws the thread bubble with a stroke that comes out at the design width after its inset scale', () => {
        const { container } = render(<IconThreadChip />);

        const bubble = container.querySelector('path');
        const scale = Number(/scale\(([\d.]+)\)/.exec(bubble?.getAttribute('transform') ?? '')?.[1]);
        expect(Number(bubble?.getAttribute('stroke-width')) * scale).toBeCloseTo(0.8667, 4);
    });
});
