import { describe, expect, it } from 'vitest';

import { stripMarkdown } from './stripMarkdown';

describe('stripMarkdown', () => {
    it('keeps a labelled link as its label', () => {
        expect(stripMarkdown('see [the docs](https://example.com/a) here')).toBe('see the docs here');
    });

    // The composer's format buttons stack, so a preview must drop every layer of markers.
    it('drops the markers of stacked marks', () => {
        expect(stripMarkdown('***123123***')).toBe('123123');
        expect(stripMarkdown('**a *b* c** and *d **e** f*')).toBe('a b c and d e f');
        expect(stripMarkdown('**~~gone~~**')).toBe('gone');
    });

    it('keeps a bare address as is', () => {
        expect(stripMarkdown('see https://example.com/a')).toBe('see https://example.com/a');
    });

    it('keeps a labelled link inside code literal, as the reader does', () => {
        expect(stripMarkdown('`[a](https://x.example)`')).toBe('[a](https://x.example)');
    });

    it('drops a quote marker but keeps an emoticon that starts with >', () => {
        expect(stripMarkdown('> 인용\n>_< 헐\n>')).toBe('인용\n>_< 헐\n');
    });
});
