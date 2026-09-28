import { render } from '@testing-library/react';

import { IconCameraSolid } from './IconCameraSolid';
import { IconFileSolid } from './IconFileSolid';
import { IconGalleryWideSolid } from './IconGalleryWideSolid';

/**
 * The three attach-menu glyphs exported from the Figma chat attach sheet. Grouped because the
 * contract is identical: square, 32px frame, `currentColor`, `size`-driven — the tile decides the
 * colour, the glyph never carries one.
 */
describe.each([
    ['IconGalleryWideSolid', IconGalleryWideSolid],
    ['IconCameraSolid', IconCameraSolid],
    ['IconFileSolid', IconFileSolid],
] as const)('%s', (_name, Icon) => {
    it('renders a square svg on the Figma 32px viewBox', () => {
        const { container } = render(<Icon />);
        const svg = container.querySelector('svg') as SVGSVGElement;

        expect(svg.getAttribute('viewBox')).toBe('0 0 32 32');
        expect(svg.getAttribute('width')).toBe('32');
        expect(svg.getAttribute('height')).toBe('32');
    });

    it('fills every glyph path with currentColor', () => {
        const { container } = render(<Icon />);
        const paths = Array.from(container.querySelectorAll('path'));

        expect(paths.length).toBeGreaterThan(0);
        expect(paths.every(p => p.getAttribute('fill') === 'currentColor')).toBe(true);
    });

    it('sizes both axes by `size` and passes through className', () => {
        const { container } = render(<Icon size={24} className="text-glyph-green" />);
        const svg = container.querySelector('svg') as SVGSVGElement;

        expect(svg.getAttribute('width')).toBe('24');
        expect(svg.getAttribute('height')).toBe('24');
        expect(svg.getAttribute('class')).toContain('text-glyph-green');
    });

    it('is hidden from assistive tech', () => {
        const { container } = render(<Icon />);
        expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    });
});

// The gallery glyph is three separately placed shapes (frame, dot, upper frame) and the file glyph
// two (sheet, folded corner). Merging them is the drift that makes a redrawn icon read as "almost
// right", so the shape count is pinned.
it('keeps each design shape as its own path', () => {
    expect(render(<IconGalleryWideSolid />).container.querySelectorAll('path')).toHaveLength(3);
    expect(render(<IconCameraSolid />).container.querySelectorAll('path')).toHaveLength(1);
    expect(render(<IconFileSolid />).container.querySelectorAll('path')).toHaveLength(2);
});
