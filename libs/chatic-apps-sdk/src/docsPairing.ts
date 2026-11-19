/**
 * The shape a document and its translation share: headings (outside code) by level, and the number of
 * code blocks. The mini app packages ship their author documents in English and Korean, and each
 * package's test holds every pair to the same shape; whether the translation says the same thing is a
 * reviewer's to judge. Not in the published package — it is reached through `./internal`.
 */
export interface DocumentShape {
    headings: string[];
    codeBlocks: number;
}

const FENCE = /^ *```[\s\S]*?^ *```/gm;

export const shapeOf = (markdown: string): DocumentShape => {
    const prose = markdown.replace(FENCE, '');
    return {
        headings: (prose.match(/^#{1,6} /gm) ?? []).map(heading => heading.trim()),
        codeBlocks: (markdown.match(FENCE) ?? []).length,
    };
};

/** The first line each of a pair opens with: the English one points at the Korean one, and back. */
export const POINTER_LINES = { english: /^> Korean: /, korean: /^> English: / } as const;

/**
 * A document's first line of text, after the front matter a skill opens with (`---` … `---`), if any:
 * where the pointer to the other language goes.
 */
export const firstLine = (markdown: string): string =>
    markdown
        .replace(/^---\n[\s\S]*?\n---\n/, '')
        .replace(/^\s*\n/, '')
        .split('\n')[0];
