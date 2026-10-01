import { render } from '@testing-library/react';

import {
    IconFileDoc,
    IconFileGeneric,
    IconFileHangul,
    IconFilePdf,
    IconFileSheet,
    IconFileSlides,
    IconFileText,
} from './FileKindIcons';
import { IconPlaySolid } from './IconPlaySolid';

/**
 * The glyphs the message feed draws for attachments: the video tile's play mark and the document
 * card's file kinds. Grouped because the contract is the kit's glyph contract — square, `size`-driven,
 * `currentColor`, hidden from assistive tech — the tile or card decides the colour.
 */
describe.each([
    ['IconPlaySolid', IconPlaySolid, 24, '0 0 24 24'],
    ['IconFilePdf', IconFilePdf, 32, '0 0 32 32'],
    ['IconFileDoc', IconFileDoc, 32, '0 0 32 32'],
    ['IconFileSheet', IconFileSheet, 32, '0 0 32 32'],
    ['IconFileSlides', IconFileSlides, 32, '0 0 32 32'],
    ['IconFileHangul', IconFileHangul, 32, '0 0 32 32'],
    ['IconFileText', IconFileText, 32, '0 0 32 32'],
    ['IconFileGeneric', IconFileGeneric, 32, '0 0 32 32'],
] as const)('%s', (_name, Icon, defaultSize, viewBox) => {
    it('renders a square svg on its own frame', () => {
        const { container } = render(<Icon />);
        const svg = container.querySelector('svg') as SVGSVGElement;

        expect(svg.getAttribute('viewBox')).toBe(viewBox);
        expect(svg.getAttribute('width')).toBe(String(defaultSize));
        expect(svg.getAttribute('height')).toBe(String(defaultSize));
    });

    it('fills every shape with currentColor', () => {
        const { container } = render(<Icon />);
        const paths = Array.from(container.querySelectorAll('path'));

        expect(paths.length).toBeGreaterThan(0);
        expect(paths.every(p => p.getAttribute('fill') === 'currentColor')).toBe(true);
    });

    it('sizes both axes by `size` and passes through className', () => {
        const { container } = render(<Icon size={20} className="text-destructive" />);
        const svg = container.querySelector('svg') as SVGSVGElement;

        expect(svg.getAttribute('width')).toBe('20');
        expect(svg.getAttribute('height')).toBe('20');
        expect(svg.getAttribute('class')).toContain('text-destructive');
    });

    it('is hidden from assistive tech', () => {
        const { container } = render(<Icon />);
        expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    });
});

// The tag is what tells the kinds apart for anyone the tint does not reach; the generic sheet has none.
it.each([
    [IconFilePdf, 'PDF'],
    [IconFileDoc, 'DOC'],
    [IconFileSheet, 'XLS'],
    [IconFileSlides, 'PPT'],
    [IconFileHangul, 'HWP'],
    [IconFileText, 'TXT'],
    [IconFileGeneric, undefined],
])('tags each file kind with its format (%#)', (Icon, tag) => {
    const { container } = render(<Icon />);
    expect(container.querySelector('text')?.textContent).toBe(tag);
});
