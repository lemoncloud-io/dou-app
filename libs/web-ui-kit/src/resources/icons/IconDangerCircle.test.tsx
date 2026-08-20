import { render } from '@testing-library/react';

import { IconDangerCircle } from './IconDangerCircle';

/**
 * Not folded into DuotoneIcons.test.tsx: that suite's contract is "every path is `currentColor`",
 * and this glyph is two-tone — disc and mark take two DIFFERENT tokens, the way
 * IconCheckCircleSolid does. Tokens rather than the exported hex is the whole point of the
 * component existing, so that is what gets asserted.
 */
describe('IconDangerCircle', () => {
    it('renders a square svg on the Figma viewBox', () => {
        const { container } = render(<IconDangerCircle />);
        const svg = container.querySelector('svg') as SVGSVGElement;

        expect(svg.getAttribute('viewBox')).toBe('0 0 28 28');
        expect(svg.getAttribute('width')).toBe('28');
        expect(svg.getAttribute('height')).toBe('28');
    });

    it('sizes both axes by `size` and passes through className', () => {
        const { container } = render(<IconDangerCircle size={40} className="shrink-0" />);
        const svg = container.querySelector('svg') as SVGSVGElement;

        expect(svg.getAttribute('width')).toBe('40');
        expect(svg.getAttribute('height')).toBe('40');
        expect(svg.getAttribute('class')).toContain('shrink-0');
    });

    it('paints every layer from a theme token, never a literal colour', () => {
        const { container } = render(<IconDangerCircle />);
        const paths = Array.from(container.querySelectorAll('path'));

        expect(paths.length).toBe(3); // disc + the exclamation's stem and dot
        for (const path of paths) {
            expect(path.getAttribute('fill')).toBeNull();
            expect(path.getAttribute('class')).toMatch(/^fill-/);
        }
    });

    it('separates the disc from the mark so the glyph stays legible in both themes', () => {
        const { container } = render(<IconDangerCircle />);
        const [disc, ...mark] = Array.from(container.querySelectorAll('path'));

        expect(disc.getAttribute('class')).toBe('fill-input-border');
        expect(mark.every(p => p.getAttribute('class') === 'fill-foreground')).toBe(true);
    });

    it('is decorative — the label lives on the row that owns it', () => {
        const { container } = render(<IconDangerCircle />);

        expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    });
});
