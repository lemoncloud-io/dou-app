import { Fragment, type ReactNode } from 'react';

import { GROUP_MENTIONS, MENTION_TOKEN_SOURCE, UserProfilePopover } from '../../../shared';

// The message styles live in `@chatic/block-kit`: the block renderer needs them
// and that renderer is what got shared.
import {
    MSG_BOLD_CLASS,
    MSG_CODE_BLOCK_CLASS,
    MSG_CODE_INLINE_CLASS,
    MSG_MENTION_CLASS,
    MSG_MENTION_SELF_CLASS,
    MSG_QUOTE_CLASS,
} from '@chatic/block-kit';

/** Name (without the @) → the member it refers to, when the roster knows one. */
export type MentionResolver = (name: string) => { userId: string; name: string } | undefined;

// One pass over a non-code run: bold, italic, strikethrough, links, @mentions.
// Bold is listed before italic so `**x**` matches as bold, not italic.
const INLINE = new RegExp(
    `(\\*\\*[^*\\n]+\\*\\*)|(\\*[^*\\n]+\\*)|(~~[^~\\n]+~~)|(https?:\\/\\/[^\\s]+)|(@${MENTION_TOKEN_SOURCE}+)`,
    'gu'
);

const renderInline = (
    text: string,
    keyBase: string,
    selfNames?: string[],
    resolveMention?: MentionResolver
): ReactNode[] => {
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
                <strong key={key} className={MSG_BOLD_CLASS}>
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
                    // Underlined at rest, not only on hover: colour alone cannot carry
                    // "this is a link" inside body text (WCAG 1.4.1), and the colour it
                    // used to carry was the brand accent, shared with every button.
                    className="text-link underline underline-offset-2 hover:no-underline"
                >
                    {url}
                </a>
            );
        } else {
            // My own name (or @channel/@here) reads louder — Slack-style callout.
            const isSelf =
                !!selfNames?.length &&
                (GROUP_MENTIONS.includes(mention.toLowerCase()) || selfNames.includes(mention.slice(1).toLowerCase()));
            const className = isSelf ? MSG_MENTION_SELF_CLASS : MSG_MENTION_CLASS;
            // A mention that names a known member opens their profile, the same card
            // an avatar opens. It used to be inert text, so checking who was
            // mentioned meant finding one of their messages first.
            const person = resolveMention?.(mention.slice(1));
            nodes.push(
                person ? (
                    <UserProfilePopover key={key} userId={person.userId} fallbackName={person.name}>
                        <button type="button" className={`focus-ring rounded-sm ${className}`}>
                            {mention}
                        </button>
                    </UserProfilePopover>
                ) : (
                    <span key={key} className={className}>
                        {mention}
                    </span>
                )
            );
        }
        last = match.index + token.length;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes;
};

// Backtick `code` spans split out first so markdown inside them stays literal —
// odd split indices are the captured spans.
const renderCodeRuns = (
    text: string,
    keyBase: string,
    selfNames?: string[],
    resolveMention?: MentionResolver
): ReactNode[] =>
    text.split(/(`[^`\n]+`)/g).map((part, idx) =>
        idx % 2 === 1 ? (
            <code key={`${keyBase}-${idx}`} className={MSG_CODE_INLINE_CLASS}>
                {part.slice(1, -1)}
            </code>
        ) : (
            <Fragment key={`${keyBase}-${idx}`}>
                {renderInline(part, `${keyBase}-${idx}`, selfNames, resolveMention)}
            </Fragment>
        )
    );

// Group consecutive "> " lines into one quote block; other lines flow as-is
// (the host preserves their newlines via whitespace-pre-wrap).
const renderQuoteRuns = (
    text: string,
    keyBase: string,
    selfNames?: string[],
    resolveMention?: MentionResolver
): ReactNode[] => {
    const nodes: ReactNode[] = [];
    let plain: string[] = [];
    let quote: string[] = [];
    let block = 0;
    const flushPlain = () => {
        if (!plain.length) return;
        nodes.push(
            <Fragment key={`${keyBase}-p${block++}`}>
                {renderCodeRuns(plain.join('\n'), `${keyBase}-p${block}`, selfNames, resolveMention)}
            </Fragment>
        );
        plain = [];
    };
    const flushQuote = () => {
        if (!quote.length) return;
        nodes.push(
            // block-level span: legal inside the host <p>, unlike <blockquote>.
            <span key={`${keyBase}-q${block++}`} className={MSG_QUOTE_CLASS}>
                {renderCodeRuns(quote.join('\n'), `${keyBase}-q${block}`, selfNames, resolveMention)}
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
    /** Makes a mention of a known member open that member's profile. */
    resolveMention?: MentionResolver;
}

/**
 * Message text with lightweight, safe formatting — no HTML injection. Parse
 * order: fenced ```code blocks``` are split out first (their contents stay
 * fully literal), then "> " quote lines group into quote blocks, then backtick
 * `code` spans, then the inline pass (**bold**, *italic*, ~~strike~~, links,
 * @mentions). Block elements render as display:block <span>s because the host
 * wraps messages in a <p>.
 */
export const RichText = ({ content, selfNames, resolveMention }: RichTextProps): ReactNode => {
    if (!content) return null;
    return content.split(/(```[\s\S]*?```)/g).map((part, idx) => {
        if (idx % 2 === 1) {
            const inner = part.slice(3, -3).replace(/^\n/, '').replace(/\n$/, '');
            return (
                <span key={idx} className={MSG_CODE_BLOCK_CLASS}>
                    {inner}
                </span>
            );
        }
        return <Fragment key={idx}>{renderQuoteRuns(part, String(idx), selfNames, resolveMention)}</Fragment>;
    });
};
