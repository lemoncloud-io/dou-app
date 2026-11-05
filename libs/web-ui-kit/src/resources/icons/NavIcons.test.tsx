import { render } from '@testing-library/react';

import { IconNavChat, IconNavChatSolid, IconNavMy, IconNavMySolid } from './NavIcons';

describe('NavIcons', () => {
    // The app sets a `<base href>`, against which a `url(#…)` reference can resolve to nothing on
    // any other path. None of these glyphs may depend on one.
    it.each([
        ['IconNavChat', IconNavChat],
        ['IconNavChatSolid', IconNavChatSolid],
        ['IconNavMy', IconNavMy],
        ['IconNavMySolid', IconNavMySolid],
    ])('%s references no mask, clip path or other fragment url', (_name, Icon) => {
        const { container } = render(<Icon />);

        expect(container.querySelector('mask, clipPath, defs')).toBeNull();
        expect(container.innerHTML).not.toContain('url(#');
    });

    // The design's line is 1.5px inside the outline; the glyph shrinks the path and widens the
    // stroke by the same factor, so what reaches the screen is still a 1.5px line.
    it('draws the line chat glyph with a stroke that comes out at 1.5px after its inset scale', () => {
        const { container } = render(<IconNavChat />);

        const path = container.querySelector('path');
        const scale = Number(/scale\(([\d.]+)\)/.exec(path?.getAttribute('transform') ?? '')?.[1]);
        expect(scale).toBeGreaterThan(0.9);
        expect(scale).toBeLessThan(1);
        expect(Number(path?.getAttribute('stroke-width')) * scale).toBeCloseTo(1.5, 5);
    });

    it.each([
        ['IconNavChat', IconNavChat],
        ['IconNavChatSolid', IconNavChatSolid],
        ['IconNavMy', IconNavMy],
        ['IconNavMySolid', IconNavMySolid],
    ])('%s is decorative and sized by the size prop', (_name, Icon) => {
        const { container } = render(<Icon size={20} />);

        const svg = container.querySelector('svg');
        expect(svg).toHaveAttribute('aria-hidden', 'true');
        expect(svg).toHaveAttribute('width', '20');
        expect(svg).toHaveAttribute('height', '20');
    });
});
