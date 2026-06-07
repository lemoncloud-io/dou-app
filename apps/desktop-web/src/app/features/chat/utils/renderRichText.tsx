import { Fragment, type ReactNode } from 'react';

// One pass over a non-code run: bold, italic, links, @mentions. Bold is listed
// before italic so `**x**` matches as bold, not italic.
const INLINE = /(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(https?:\/\/[^\s]+)|(@[\w.-]+)/g;

const renderInline = (text: string, keyBase: string): ReactNode[] => {
    const nodes: ReactNode[] = [];
    let last = 0;
    let i = 0;
    INLINE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = INLINE.exec(text)) !== null) {
        if (match.index > last) nodes.push(text.slice(last, match.index));
        const [token, bold, italic, url, mention] = match;
        const key = `${keyBase}-${i++}`;
        if (bold) {
            nodes.push(
                <strong key={key} className="font-semibold">
                    {bold.slice(2, -2)}
                </strong>
            );
        } else if (italic) {
            nodes.push(<em key={key}>{italic.slice(1, -1)}</em>);
        } else if (url) {
            nodes.push(
                <a
                    key={key}
                    href={url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary underline underline-offset-2 hover:opacity-80"
                >
                    {url}
                </a>
            );
        } else if (mention) {
            nodes.push(
                <span key={key} className="rounded bg-primary/15 px-0.5 font-medium text-primary">
                    {mention}
                </span>
            );
        }
        last = match.index + token.length;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes;
};

/**
 * Render message text with lightweight, safe formatting — no HTML injection.
 * Backtick `code` spans are extracted first (so markdown inside them stays
 * literal); the rest is scanned for **bold**, *italic*, links, and @mentions.
 */
export const renderRichText = (content: string): ReactNode => {
    if (!content) return content;
    return content.split(/(`[^`\n]+`)/g).map((part, idx) => {
        if (part.length >= 2 && part.startsWith('`') && part.endsWith('`')) {
            return (
                <code key={idx} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
                    {part.slice(1, -1)}
                </code>
            );
        }
        return <Fragment key={idx}>{renderInline(part, String(idx))}</Fragment>;
    });
};
