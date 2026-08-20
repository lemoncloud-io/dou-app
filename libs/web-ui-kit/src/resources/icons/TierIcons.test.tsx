import { render } from '@testing-library/react';

import { IconBoltSolid } from './IconBoltSolid';
import { IconStarsSolid } from './IconStarsSolid';

/**
 * The two subscription-tier glyphs exported from the Figma 구독 상태 뱃지 component. Grouped because
 * the contract is identical: square, 16px frame, `currentColor`, `size`-driven.
 */
describe.each([
    ['IconBoltSolid', IconBoltSolid],
    ['IconStarsSolid', IconStarsSolid],
] as const)('%s', (_name, Icon) => {
    it('renders a square svg on the Figma 16px viewBox', () => {
        const { container } = render(<Icon />);
        const svg = container.querySelector('svg') as SVGSVGElement;

        expect(svg.getAttribute('viewBox')).toBe('0 0 16 16');
        expect(svg.getAttribute('width')).toBe('16');
        expect(svg.getAttribute('height')).toBe('16');
    });

    it('fills every glyph path with currentColor', () => {
        const { container } = render(<Icon />);
        const paths = Array.from(container.querySelectorAll('path'));

        expect(paths.length).toBeGreaterThan(0);
        expect(paths.every(p => p.getAttribute('fill') === 'currentColor')).toBe(true);
    });

    it('sizes both axes by `size` and passes through className', () => {
        const { container } = render(<Icon size={24} className="text-brand-ink" />);
        const svg = container.querySelector('svg') as SVGSVGElement;

        expect(svg.getAttribute('width')).toBe('24');
        expect(svg.getAttribute('height')).toBe('24');
        expect(svg.getAttribute('class')).toContain('text-brand-ink');
    });

    it('is hidden from assistive tech', () => {
        const { container } = render(<Icon />);
        expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    });
});

// The design's FREE glyph is a star plus TWO separate sparks placed by their own insets — merging
// them (or dropping one) is exactly the drift that made the lucide stand-in read as "almost right".
it('IconStarsSolid keeps the star and both sparks as separately placed shapes', () => {
    const { container } = render(<IconStarsSolid />);

    expect(container.querySelectorAll('path')).toHaveLength(3);
    expect(container.querySelectorAll('g[transform]')).toHaveLength(3);
});
