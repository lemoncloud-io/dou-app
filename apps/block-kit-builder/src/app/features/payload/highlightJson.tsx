import { Fragment, type ReactNode } from 'react';

const TOKEN =
    /"(?:[^"\\]|\\.)*"(?=\s*:)|"(?:[^"\\]|\\.)*"?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b/g;

const CLASS_BY_KIND = {
    key: 'text-[hsl(var(--code-key))]',
    string: 'text-[hsl(var(--code-string))]',
    literal: 'text-[hsl(var(--code-literal))]',
} as const;

const kindOf = (token: string, source: string, end: number): keyof typeof CLASS_BY_KIND => {
    if (token[0] !== '"') return 'literal';
    return /^\s*:/.test(source.slice(end)) ? 'key' : 'string';
};

export const highlightJsonLine = (line: string): ReactNode => {
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
