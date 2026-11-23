import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');
const html = readFileSync(join(__dirname, '../index.html'), 'utf8');

describe('font loading', () => {
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
