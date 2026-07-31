import { render } from '@testing-library/react';

import { IconClockSolid } from './IconClockSolid';
import { IconImageSolid } from './IconImageSolid';
import { IconUsersGroup } from './IconUsersGroup';

/**
 * The three Figma duotone glyphs added for the invite accept screen (ADR-0037).
 * Grouped because the contract is identical: square, `currentColor`, `size`-driven.
 */
describe.each([
    ['IconClockSolid', IconClockSolid, 20, '0 0 20 20'],
    ['IconUsersGroup', IconUsersGroup, 18, '0 0 18 18'],
    ['IconImageSolid', IconImageSolid, 40, '0 0 40 40'],
] as const)('%s', (_name, Icon, defaultSize, viewBox) => {
    it('renders a square svg on the Figma viewBox', () => {
        const { container } = render(<Icon />);
        const svg = container.querySelector('svg') as SVGSVGElement;

        expect(svg.getAttribute('viewBox')).toBe(viewBox);
        expect(svg.getAttribute('width')).toBe(String(defaultSize));
        expect(svg.getAttribute('height')).toBe(String(defaultSize));
    });

    it('fills every glyph path with currentColor', () => {
        const { container } = render(<Icon />);
        const paths = Array.from(container.querySelectorAll('path'));

        expect(paths.length).toBeGreaterThan(0);
        expect(paths.every(p => p.getAttribute('fill') === 'currentColor')).toBe(true);
    });

    it('sizes both axes by `size` and passes through className', () => {
        const { container } = render(<Icon size={64} className="text-brand-ink" />);
        const svg = container.querySelector('svg') as SVGSVGElement;

        expect(svg.getAttribute('width')).toBe('64');
        expect(svg.getAttribute('height')).toBe('64');
        expect(svg.getAttribute('class')).toContain('text-brand-ink');
    });

    it('is hidden from assistive tech', () => {
        const { container } = render(<Icon />);
        expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    });
});

describe('duotone layering', () => {
    it('IconClockSolid dims the dial behind solid hands', () => {
        const { container } = render(<IconClockSolid />);
        const opacities = Array.from(container.querySelectorAll('path')).map(p => p.getAttribute('opacity'));

        expect(opacities).toContain('0.5');
        // The hands stay fully opaque so they read against the dial.
        expect(opacities).toContain(null);
    });

    it('IconUsersGroup dims exactly the four flanking shapes', () => {
        const { container } = render(<IconUsersGroup />);
        const paths = Array.from(container.querySelectorAll('path'));

        expect(paths).toHaveLength(6);
        expect(paths.filter(p => p.getAttribute('opacity') === '0.4')).toHaveLength(4);
        // Centre person (head + body) is solid.
        expect(paths.filter(p => p.getAttribute('opacity') === null)).toHaveLength(2);
    });

    it('IconImageSolid knocks the photo motif out of its disc', () => {
        const { container } = render(<IconImageSolid />);
        const disc = Array.from(container.querySelectorAll('path')).find(
            p => p.getAttribute('fill-rule') === 'evenodd'
        );

        // Without evenodd the ridge cut-out would fill solid and the glyph would be a plain disc.
        expect(disc).toBeTruthy();
    });
});
