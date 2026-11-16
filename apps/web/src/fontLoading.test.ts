import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * What the page asks a font host for on its way to the first paint, read from the files themselves.
 *
 * styles.css used to @import Pretendard from Google Fonts. Google Fonts does not serve that family, so
 * the request answered 400 on every boot: the stylesheet's <link> fired an error the app logged as a
 * resource failure, and the @import held the first paint until the refusal came back.
 */
const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');
const html = readFileSync(join(__dirname, '../index.html'), 'utf8');

describe('font loading', () => {
    // A local @import is inlined by the build and costs nothing; only one fetched over the network
    // makes the first paint wait.
    it('does not @import a remote stylesheet, which would block the first paint', () => {
        expect(css).not.toMatch(/@import\s+(url\()?['"]?(https?:)?\/\//);
    });

    it('still names Pretendard first, for a device that has it installed', () => {
        expect(css).toMatch(/font-family:\s*'Pretendard',/);
    });

    it('opens no connection to Google Fonts from the document head', () => {
        expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    });
});
