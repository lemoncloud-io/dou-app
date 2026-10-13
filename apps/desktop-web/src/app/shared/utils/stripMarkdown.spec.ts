import { describe, expect, it } from 'vitest';

import { stripMarkdown } from './stripMarkdown';

describe('stripMarkdown', () => {
    it('keeps a labelled link as its label', () => {
        expect(stripMarkdown('see [the docs](https://example.com/a) here')).toBe('see the docs here');
    });

    it('keeps a bare address as is', () => {
        expect(stripMarkdown('see https://example.com/a')).toBe('see https://example.com/a');
    });

    it('keeps a labelled link inside code literal, as the reader does', () => {
        expect(stripMarkdown('`[a](https://x.example)`')).toBe('[a](https://x.example)');
    });
});
