import { Fragment, type ReactNode } from 'react';

import { cn } from '@chatic/lib/utils';

import { GROUP_MENTIONS } from '../../../shared';

// One pass over a non-code run: bold, italic, strikethrough, links, @mentions.
// Bold is listed before italic so `**x**` matches as bold, not italic.
const INLINE = /(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(~~[^~\n]+~~)|(https?:\/\/[^\s]+)|(@[\w.-]+)/g;

const renderInline = (text: string, keyBase: string, selfNames?: string[]): ReactNode[] => {
    const nodes: ReactNode[] = [];
    let last = 0;
    INLINE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = INLINE.exec(text)) !== null) {
        if (match.index > last) nodes.push(text.slice(last, match.index));
        const [token, bold, italic, strike, url, mention] = match;
        const key = `${keyBase}-${match.index}`;
        if (bold) {
            nodes.push(
                <strong key={key} className="font-semibold">
                    {bold.slice(2, -2)}
                </strong>
            );
        } else if (italic) {
            nodes.push(<em key={key}>{italic.slice(1, -1)}</em>);
        } else if (strike) {
            nodes.push(<s key={key}>{strike.slice(2, -2)}</s>);
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
            // My own name (or @channel/@here) reads louder — Slack-style callout.
            const isSelf =
                !!selfNames?.length &&
                (GROUP_MENTIONS.includes(mention.toLowerCase()) || selfNames.includes(mention.slice(1).toLowerCase()));
            nodes.push(
                <span
                    key={key}
                    className={cn(
                        'rounded px-1 font-medium',
                        isSelf ? 'bg-warning/30 text-foreground' : 'bg-primary/10 text-primary-ink'
                    )}
                >
                    {mention}
                </span>
            );
        }
        last = match.index + token.length;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes;
};

// Backtick `code` spans split out first so markdown inside them stays literal —
// odd split indices are the captured spans.
const renderCodeRuns = (text: string, keyBase: string, selfNames?: string[]): ReactNode[] =>
    text.split(/(`[^`\n]+`)/g).map((part, idx) =>
        idx % 2 === 1 ? (
            <code key={`${keyBase}-${idx}`} className="rounded bg-well px-1 py-0.5 font-mono text-[0.85em]">
                {part.slice(1, -1)}
            </code>
        ) : (
            <Fragment key={`${keyBase}-${idx}`}>{renderInline(part, `${keyBase}-${idx}`, selfNames)}</Fragment>
        )
    );

// Group consecutive "> " lines into one quote block; other lines flow as-is
// (the host preserves their newlines via whitespace-pre-wrap).
const renderQuoteRuns = (text: string, keyBase: string, selfNames?: string[]): ReactNode[] => {
    const nodes: ReactNode[] = [];
    let plain: string[] = [];
    let quote: string[] = [];
    let block = 0;
    const flushPlain = () => {
        if (!plain.length) return;
        nodes.push(
            <Fragment key={`${keyBase}-p${block++}`}>
                {renderCodeRuns(plain.join('\n'), `${keyBase}-p${block}`, selfNames)}
            </Fragment>
        );
        plain = [];
    };
    const flushQuote = () => {
        if (!quote.length) return;
        nodes.push(
            // block-level span: legal inside the host <p>, unlike <blockquote>.
            <span
                key={`${keyBase}-q${block++}`}
                className="my-0.5 block border-l-2 border-primary/40 pl-2 text-muted-foreground"
            >
                {renderCodeRuns(quote.join('\n'), `${keyBase}-q${block}`, selfNames)}
            </span>
        );
        quote = [];
    };
    for (const line of text.split('\n')) {
        const quoted = line.match(/^>\s?(.*)$/);
        if (quoted) {
            flushPlain();
            quote.push(quoted[1]);
        } else {
            flushQuote();
            plain.push(line);
        }
    }
    flushPlain();
    flushQuote();
    return nodes;
};

interface RichTextProps {
    content: string;
    /** Lowercased names that count as "me" — my mentions render highlighted. */
    selfNames?: string[];
}

/**
 * Message text with lightweight, safe formatting — no HTML injection. Parse
 * order: fenced ```code blocks``` are split out first (their contents stay
 * fully literal), then "> " quote lines group into quote blocks, then backtick
 * `code` spans, then the inline pass (**bold**, *italic*, ~~strike~~, links,
 * @mentions). Block elements render as display:block <span>s because the host
 * wraps messages in a <p>.
 */
export const RichText = ({ content, selfNames }: RichTextProps): ReactNode => {
    if (!content) return null;
    return content.split(/(```[\s\S]*?```)/g).map((part, idx) => {
        if (idx % 2 === 1) {
            const inner = part.slice(3, -3).replace(/^\n/, '').replace(/\n$/, '');
            return (
                <span
                    key={idx}
                    className="my-1 block overflow-x-auto rounded-md border border-hairline bg-well p-2 font-mono text-[0.85em] leading-relaxed"
                >
                    {inner}
                </span>
            );
        }
        return <Fragment key={idx}>{renderQuoteRuns(part, String(idx), selfNames)}</Fragment>;
    });
};
