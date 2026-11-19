import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The author documents ship in English and in Korean (`.ko.md` beside each). The English file is the
 * canonical one; this keeps the two from drifting apart in shape: the same headings, the same code
 * blocks, and each pointing at the other on its first line. Whether the translation says the same
 * thing is a reviewer's to judge — a change to one file's content goes with the same change to the
 * other, in the same pull request.
 */

const PACKAGE = join(__dirname, '..');

/** Each English document, its Korean pair, and the name the English one ships under. */
const PAIRS = [
    { english: 'README.md', korean: 'README.ko.md' },
    { english: 'docs/guide/README.md', korean: 'docs/guide/README.ko.md' },
    { english: 'docs/guide/agent-rules.md', korean: 'docs/guide/agent-rules.ko.md' },
];

const FENCE = /^ *```[\s\S]*?^ *```/gm;

/** The shape both files must share: headings (outside code) by level, and the number of code blocks. */
const shapeOf = (markdown: string) => {
    const prose = markdown.replace(FENCE, '');
    return {
        headings: (prose.match(/^#{1,6} /gm) ?? []).map(heading => heading.trim()),
        codeBlocks: (markdown.match(FENCE) ?? []).length,
    };
};

const read = (file: string) => readFileSync(join(PACKAGE, file), 'utf8');

describe('the Korean author documents', () => {
    it.each(PAIRS)('$korean exists beside $english', ({ korean }) => {
        expect(existsSync(join(PACKAGE, korean))).toBe(true);
    });

    it.each(PAIRS)('$korean has the same headings and code blocks as $english', ({ english, korean }) => {
        expect(shapeOf(read(korean))).toEqual(shapeOf(read(english)));
    });

    it.each(PAIRS)('$english and $korean point at each other on their first line', ({ english, korean }) => {
        expect(read(english).split('\n')[0]).toMatch(/^> Korean: /);
        expect(read(korean).split('\n')[0]).toMatch(/^> English: /);
    });

    it('notices a section missing from one side', () => {
        const english = '# Title\n\n## One\n\ntext\n\n## Two\n\n```ts\nx\n```\n';
        const korean = '# 제목\n\n## 하나\n\n본문\n';
        expect(shapeOf(korean)).not.toEqual(shapeOf(english));
    });

    it('does not count a `#` line inside a code block as a heading', () => {
        expect(shapeOf('# Title\n\n```bash\n# a comment\n```\n')).toEqual({ headings: ['#'], codeBlocks: 1 });
    });
});
