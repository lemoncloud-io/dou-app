import { render } from '@testing-library/react';

import { IconGroup } from './IconGroup';

describe('IconGroup', () => {
    it('renders an svg that fills with currentColor', () => {
        const { container } = render(<IconGroup />);
        const svg = container.querySelector('svg');

        expect(svg).toBeTruthy();
        // All glyph paths inherit the caller's color.
        expect(svg?.querySelectorAll('path[fill="currentColor"]').length).toBeGreaterThan(0);
    });

    it('sizes width by `size` and keeps the native aspect ratio', () => {
        const { container } = render(<IconGroup size={26} />);
        const svg = container.querySelector('svg') as SVGSVGElement;

        expect(svg.getAttribute('width')).toBe('26');
        // height = 26 * (20.8011 / 26.0006) ≈ 20.8
        expect(Number(svg.getAttribute('height'))).toBeCloseTo(20.8, 1);
    });

    it('passes through className', () => {
        const { container } = render(<IconGroup className="text-white" />);
        expect(container.querySelector('svg')?.getAttribute('class')).toContain('text-white');
    });
});
