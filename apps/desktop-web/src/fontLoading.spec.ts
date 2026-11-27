import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');

const pretendardFaces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)]
    .map(([, body]) => body)
    .filter(body => /font-family:\s*Pretendard;/.test(body));

describe('Pretendard loading', () => {
    it('does not @import a remote stylesheet, which would block the first paint', () => {
        expect(css).not.toMatch(/@import\s+(url\()?['"]?(https?:)?\/\//);
    });

    it('declares the weights the UI uses, each with font-display swap', () => {
        const weights = pretendardFaces.map(body => body.match(/font-weight:\s*(\d+);/)?.[1]);
        expect(weights).toEqual(['400', '500', '600', '700']);
        for (const body of pretendardFaces) expect(body).toMatch(/font-display:\s*swap;/);
    });

    it('points at the full static files, not the subset', () => {
        for (const body of pretendardFaces) {
            expect(body).toMatch(/\/static\/woff2\/Pretendard-\w+\.woff2/);
            expect(body).not.toMatch(/subset/i);
        }
    });
});
