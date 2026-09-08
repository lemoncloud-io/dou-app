import { Fragment, type ReactNode } from 'react';

/**
 * JSON, coloured, one line at a time.
 *
 * Per line rather than over the whole document because the highlighted copy has
 * to line up with the textarea drawn on top of it and the numbers drawn beside
 * it. Three elements agreeing on where line 8 is by each laying out line 8 as
 * its own box is a guarantee; three elements agreeing because they were given
 * the same line-height is an arithmetic bet that a font swap can lose. JSON
 * cannot carry a raw newline inside a string, so a line is always a whole number
 * of tokens and splitting on `\n` never cuts one in half.
 *
 * Runs on every keystroke against text that is usually half-typed, so it scans
 * rather than parses: an unterminated string is a string, a stray brace is
 * punctuation, and nothing here can throw or drop a character. Losing one would
 * shift the text out from under the caret sitting above it.
 */

// Order matters. A key is a string that a colon follows, so it has to be offered
// before the plain-string branch or every key matches as a string first. The
// closing quote is optional for exactly one case — the string being typed right
// now, which has no closing quote yet and is still a string.
const TOKEN =
    /"(?:[^"\\]|\\.)*"(?=\s*:)|"(?:[^"\\]|\\.)*"?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b/g;

const CLASS_BY_KIND = {
    key: 'text-[hsl(var(--code-key))]',
    string: 'text-[hsl(var(--code-string))]',
    literal: 'text-[hsl(var(--code-literal))]',
} as const;

/** Which of the three a matched token is: the quote separates text from literals, the colon after it separates a key from a value. */
const kindOf = (token: string, source: string, end: number): keyof typeof CLASS_BY_KIND => {
    if (token[0] !== '"') return 'literal';
    return /^\s*:/.test(source.slice(end)) ? 'key' : 'string';
};

/**
 * One line as coloured spans.
 *
 * Everything between matches — braces, brackets, commas, indentation — is emitted
 * unstyled and inherits the punctuation colour from the container, so the text
 * that comes out is the text that went in, character for character.
 */
export const highlightJsonLine = (line: string): ReactNode => {
    // A zero-width space, not nothing: an empty div collapses to no height, and a
    // blank line that takes no space puts every number after it beside the wrong
    // line. It has no width, so it cannot shift the text either.
    if (!line) return '​';

    const parts: ReactNode[] = [];
    let cursor = 0;

    TOKEN.lastIndex = 0;
    for (let match = TOKEN.exec(line); match; match = TOKEN.exec(line)) {
        const end = match.index + match[0].length;
        if (match.index > cursor) parts.push(line.slice(cursor, match.index));
        parts.push(
            <span key={match.index} className={CLASS_BY_KIND[kindOf(match[0], line, end)]}>
                {match[0]}
            </span>
        );
        cursor = end;
    }

    if (cursor < line.length) parts.push(line.slice(cursor));

    return parts.map((part, index) => <Fragment key={index}>{part}</Fragment>);
};
