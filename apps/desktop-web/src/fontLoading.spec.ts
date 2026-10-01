import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * How styles.css loads Pretendard, read from the file itself.
 *
 * An @import of a remote stylesheet holds the first paint until that request returns, which on a
 * slow network left the first window blank. The faces are declared inline instead, and each one
 * has to paint with the fallback while its file is on the way.
 */
const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');

const pretendardFaces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)]
    .map(([, body]) => body)
    .filter(body => /font-family:\s*Pretendard;/.test(body));

describe('Pretendard loading', () => {
    it('does not @import a stylesheet, which would block the first paint', () => {
        expect(css).not.toMatch(/^\s*@import\s/m);
    });

    it('declares the weights the UI uses, each with font-display swap', () => {
        const weights = pretendardFaces.map(body => body.match(/font-weight:\s*(\d+);/)?.[1]);
        expect(weights).toEqual(['400', '500', '600', '700']);
        for (const body of pretendardFaces) expect(body).toMatch(/font-display:\s*swap;/);
    });

    // The Unicode-range subset lacks U+200B, which Lexical inserts while an IME composes.
    it('points at the full static files, not the subset', () => {
        for (const body of pretendardFaces) {
            expect(body).toMatch(/\/static\/woff2\/Pretendard-\w+\.woff2/);
            expect(body).not.toMatch(/subset/i);
        }
    });
});
