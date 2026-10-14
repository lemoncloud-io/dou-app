import { Fragment, type ReactNode } from 'react';

import {
    GROUP_MENTIONS,
    LABELLED_LINK_SOURCE,
    LINK_URL_SOURCE,
    MENTION_TOKEN_SOURCE,
    UserProfilePopover,
    isMentionBoundary,
} from '../../../shared';

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

import { splitFences } from '../utils';

/** Name (without the @) → the member it refers to, when the roster knows one. */
export type MentionResolver = (name: string) => { userId: string; name: string } | undefined;

// One pass over a non-code run: labelled links, bold, italic, strikethrough, bare links, @mentions.
// A labelled link is listed first so its address is not read as a bare one.
// Bold is listed before italic so `**x**` matches as bold, not italic.
const INLINE = new RegExp(
    `${LABELLED_LINK_SOURCE}|(\\*\\*[^*\\n]+\\*\\*)|(\\*[^*\\n]+\\*)|(~~[^~\\n]+~~)|(${LINK_URL_SOURCE})|(@${MENTION_TOKEN_SOURCE}+)`,
    'gu'
);

// Underlined at rest, not only on hover: colour alone cannot carry "this is a link" inside body
// text (WCAG 1.4.1), and the colour it used to carry was the brand accent, shared with every button.
const LINK_CLASS = 'text-link underline underline-offset-2 hover:no-underline';

// Group words by name (without the @), so the pill gate and the self check
// share one lookup instead of scanning the list twice per mention.
const GROUP_WORDS = new Set(GROUP_MENTIONS.map(group => group.slice(1)));

const renderInline = (
    text: string,
    keyBase: string,
    selfNames?: string[],
    resolveMention?: MentionResolver,
    hasMentionRecord?: boolean,
    selfSuffix?: string
): ReactNode[] => {
    const nodes: ReactNode[] = [];
    let last = 0;
    INLINE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = INLINE.exec(text)) !== null) {
        if (match.index > last) nodes.push(text.slice(last, match.index));
        const [token, label, labelHref, bold, italic, strike, url, mention] = match;
        const key = `${keyBase}-${match.index}`;
        if (label && labelHref) {
            nodes.push(
                <a key={key} href={labelHref} target="_blank" rel="noreferrer noopener" className={LINK_CLASS}>
                    {label}
                </a>
            );
        } else if (bold) {
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
                <a key={key} href={url} target="_blank" rel="noreferrer noopener" className={LINK_CLASS}>
                    {url}
                </a>
            );
        } else if (!isMentionBoundary(text, match.index)) {
            // Inside a word — an address (`lemon@lemoncloud.io`) or a password
            // (`lemoncloud@123`), never a mention. Left as the text it is.
            nodes.push(mention);
        } else {
            // A trailing sentence dot belongs to the sentence, not the name: look the
            // name up without it, but render what was written.
            const full = mention.slice(1);
            const word = full.replace(/\.+$/, '');
            const lower = word.toLowerCase();
            const isGroup = GROUP_WORDS.has(lower);
            // My own name (or @channel/@here) reads louder — Slack-style callout.
            const isSelf = !!selfNames?.length && (isGroup || selfNames.includes(lower));
            const className = isSelf ? MSG_MENTION_SELF_CLASS : MSG_MENTION_CLASS;
            // A mention that names a known member opens their profile, the same card
            // an avatar opens. It used to be inert text, so checking who was
            // mentioned meant finding one of their messages first. The full token is
            // only retried when stripping changed it.
            const person = resolveMention?.(word) ?? (word !== full ? resolveMention?.(full) : undefined);
            // A pill claims someone was called: a known member, a group word, my own
            // name, or a message whose record says so. Anything else is plain text —
            // the token pattern used to highlight any word, member or not.
            if (!person && !isSelf && !isGroup && !hasMentionRecord) {
                nodes.push(mention);
            } else {
                // A self pill reads its cue too — colour alone cannot carry "this
                // is you" (the class also adds weight; see messageClasses).
                const cue =
                    isSelf && selfSuffix ? <span className="sr-only">{selfSuffix}</span> : null;
                nodes.push(
                    person ? (
                        <UserProfilePopover key={key} userId={person.userId} fallbackName={person.name}>
                            <button type="button" className={`focus-ring rounded-sm ${className}`}>
                                {mention}
                                {cue}
                            </button>
                        </UserProfilePopover>
                    ) : (
                        <span key={key} className={className}>
                            {mention}
                            {cue}
                        </span>
                    )
                );
            }
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
    resolveMention?: MentionResolver,
    hasMentionRecord?: boolean,
    selfSuffix?: string
): ReactNode[] =>
    text.split(/(`[^`\n]+`)/g).map((part, idx) =>
        idx % 2 === 1 ? (
            <code key={`${keyBase}-${idx}`} className={MSG_CODE_INLINE_CLASS}>
                {part.slice(1, -1)}
            </code>
        ) : (
            <Fragment key={`${keyBase}-${idx}`}>
                {renderInline(part, `${keyBase}-${idx}`, selfNames, resolveMention, hasMentionRecord, selfSuffix)}
            </Fragment>
        )
    );

// Group consecutive "> " lines into one quote block; other lines flow as-is
// (the host preserves their newlines via whitespace-pre-wrap).
const renderQuoteRuns = (
    text: string,
    keyBase: string,
    selfNames?: string[],
    resolveMention?: MentionResolver,
    hasMentionRecord?: boolean,
    selfSuffix?: string
): ReactNode[] => {
    const nodes: ReactNode[] = [];
    let plain: string[] = [];
    let quote: string[] = [];
    let block = 0;
    const flushPlain = () => {
        if (!plain.length) return;
        nodes.push(
            <Fragment key={`${keyBase}-p${block++}`}>
                {renderCodeRuns(
                    plain.join('\n'),
                    `${keyBase}-p${block}`,
                    selfNames,
                    resolveMention,
                    hasMentionRecord,
                    selfSuffix
                )}
            </Fragment>
        );
        plain = [];
    };
    const flushQuote = () => {
        if (!quote.length) return;
        nodes.push(
            // block-level span: legal inside the host <p>, unlike <blockquote>.
            <span key={`${keyBase}-q${block++}`} className={MSG_QUOTE_CLASS}>
                {renderCodeRuns(
                    quote.join('\n'),
                    `${keyBase}-q${block}`,
                    selfNames,
                    resolveMention,
                    hasMentionRecord,
                    selfSuffix
                )}
            </span>
        );
        quote = [];
    };
    for (const line of text.split('\n')) {
        // `>` needs a space after it (or nothing), as the editor's own import does, so `>_<` stays text.
        const quoted = line.match(/^>(?:\s(.*))?$/);
        if (quoted) {
            flushPlain();
            quote.push(quoted[1] ?? '');
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
    /** The message carries a mention record — its @-tokens name a recorded pick, even an unknown one. */
    hasMentionRecord?: boolean;
    /** Screen-reader cue read inside a self pill ("me"), alongside the weight cue. */
    selfSuffix?: string;
}

/**
 * Message text with lightweight, safe formatting — no HTML injection. Parse
 * order: fenced ```code blocks``` are split out first (`splitFences`; their
 * contents stay fully literal and a language tag is not shown), then "> "
 * quote lines group into quote blocks, then backtick `code` spans, then the inline pass (**bold**, *italic*, ~~strike~~, links,
 * @mentions). Block elements render as display:block <span>s because the host
 * wraps messages in a <p>.
 */
export const RichText = ({
    content,
    selfNames,
    resolveMention,
    hasMentionRecord,
    selfSuffix,
}: RichTextProps): ReactNode => {
    if (!content) return null;
    return splitFences(content).map((segment, idx, segments) => {
        if (segment.type === 'code') {
            return (
                <span key={idx} className={MSG_CODE_BLOCK_CLASS}>
                    {segment.value}
                </span>
            );
        }
        // A block already ends its line, so the newline that follows its closing fence is the
        // same line break; rendering it too left an empty line under every block.
        const text = segments[idx - 1]?.type === 'code' ? segment.value.replace(/^\r?\n/, '') : segment.value;
        return (
            <Fragment key={idx}>
                {renderQuoteRuns(text, String(idx), selfNames, resolveMention, hasMentionRecord, selfSuffix)}
            </Fragment>
        );
    });
};
