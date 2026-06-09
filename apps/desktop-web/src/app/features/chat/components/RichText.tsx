import { Fragment, type ReactNode } from 'react';

// One pass over a non-code run: bold, italic, links, @mentions. Bold is listed
// before italic so `**x**` matches as bold, not italic.
const INLINE = /(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(https?:\/\/[^\s]+)|(@[\w.-]+)/g;

const renderInline = (text: string, keyBase: string): ReactNode[] => {
    const nodes: ReactNode[] = [];
    let last = 0;
    INLINE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = INLINE.exec(text)) !== null) {
        if (match.index > last) nodes.push(text.slice(last, match.index));
        const [token, bold, italic, url, mention] = match;
        const key = `${keyBase}-${match.index}`;
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
                    className="text-primary-ink underline-offset-2 hover:underline"
                >
                    {url}
                </a>
            );
        } else {
            nodes.push(
                <span key={key} className="rounded bg-primary/10 px-1 font-medium text-primary-ink">
                    {mention}
                </span>
            );
        }
        last = match.index + token.length;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes;
};

interface RichTextProps {
    content: string;
}

/**
 * Message text with lightweight, safe formatting — no HTML injection. Backtick
 * `code` spans are split out first (so markdown inside them stays literal — odd
 * split indices are the captured code spans); the rest is scanned for **bold**,
 * *italic*, links, and @mentions.
 */
export const RichText = ({ content }: RichTextProps): ReactNode => {
    if (!content) return null;
    return content.split(/(`[^`\n]+`)/g).map((part, idx) =>
        idx % 2 === 1 ? (
            <code key={idx} className="rounded bg-well px-1 py-0.5 font-mono text-[0.85em]">
                {part.slice(1, -1)}
            </code>
        ) : (
            <Fragment key={idx}>{renderInline(part, String(idx))}</Fragment>
        )
    );
};
