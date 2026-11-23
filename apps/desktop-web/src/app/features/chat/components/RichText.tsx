import { Fragment, type ReactNode } from 'react';

import {
    BOLD_SOURCE,
    GROUP_MENTIONS,
    ITALIC_SOURCE,
    LABELLED_LINK_SOURCE,
    LINK_URL_SOURCE,
    MENTION_TOKEN_SOURCE,
    UserProfilePopover,
    isMentionBoundary,
} from '../../../shared';

import {
    MSG_BOLD_CLASS,
    MSG_CODE_BLOCK_CLASS,
    MSG_CODE_INLINE_CLASS,
    MSG_MENTION_CLASS,
    MSG_MENTION_SELF_CLASS,
    MSG_QUOTE_CLASS,
} from '@chatic/block-kit';

import { splitFences } from '../utils';

export type MentionResolver = (name: string) => { userId: string; name: string } | undefined;

const INLINE = new RegExp(
    `${LABELLED_LINK_SOURCE}|${BOLD_SOURCE}|${ITALIC_SOURCE}|~~([^~\\n]+)~~|(${LINK_URL_SOURCE})|(@${MENTION_TOKEN_SOURCE}+)`,
    'gu'
);

const LINK_CLASS = 'text-link underline underline-offset-2 hover:no-underline';

const GROUP_WORDS = new Set(GROUP_MENTIONS.map(group => group.slice(1)));

const NEXT_WORD = new RegExp(`^ (${MENTION_TOKEN_SOURCE}+)`, 'u');
const MAX_EXTRA_WORDS = 3;

const extendToKnownName = (first: string, after: string, resolveMention?: MentionResolver): string | undefined => {
    if (!resolveMention) return undefined;
    let best: string | undefined;
    let candidate = first;
    let rest = after;
    for (let i = 0; i < MAX_EXTRA_WORDS; i++) {
        const next = NEXT_WORD.exec(rest);
        if (!next) break;
        candidate += next[0];
        rest = rest.slice(next[0].length);
        if (resolveMention(candidate.replace(/\.+$/, ''))) best = candidate;
    }
    return best;
};

const renderInline = (
    text: string,
    keyBase: string,
    selfNames?: string[],
    resolveMention?: MentionResolver,
    hasMentionRecord?: boolean,
    selfSuffix?: string,
    insideMark = false
): ReactNode[] => {
    const nodes: ReactNode[] = [];
    const marked = (words: string, key: string) =>
        renderInline(words, key, selfNames, resolveMention, hasMentionRecord, selfSuffix, true);
    let last = 0;
    for (const match of text.matchAll(INLINE)) {
        if (match.index < last) continue;
        const [token, label, labelHref, bold, italic, strike, url, tokenMention] = match;
        let mention = tokenMention;
        let consumed = token.length;
        if (insideMark && !bold && !italic && !strike) continue;
        if (match.index > last) nodes.push(text.slice(last, match.index));
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
                    {marked(bold, key)}
                </strong>
            );
        } else if (italic) {
            nodes.push(<em key={key}>{marked(italic, key)}</em>);
        } else if (strike) {
            nodes.push(<s key={key}>{marked(strike, key)}</s>);
        } else if (url) {
            nodes.push(
                <a key={key} href={url} target="_blank" rel="noreferrer noopener" className={LINK_CLASS}>
                    {url}
                </a>
            );
        } else if (!isMentionBoundary(text, match.index)) {
            nodes.push(mention);
        } else {
            const spaced = extendToKnownName(mention.slice(1), text.slice(match.index + token.length), resolveMention);
            if (spaced) {
                mention = `@${spaced}`;
                consumed = mention.length;
            }
            const full = mention.slice(1);
            const word = full.replace(/\.+$/, '');
            const lower = word.toLowerCase();
            const isGroup = GROUP_WORDS.has(lower);
            const isSelf = !!selfNames?.length && (isGroup || selfNames.includes(lower));
            const className = isSelf ? MSG_MENTION_SELF_CLASS : MSG_MENTION_CLASS;
            const person = resolveMention?.(word) ?? (word !== full ? resolveMention?.(full) : undefined);
            if (!person && !isSelf && !isGroup && !hasMentionRecord) {
                nodes.push(mention);
            } else {
                const cue = isSelf && selfSuffix ? <span className="sr-only">{selfSuffix}</span> : null;
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
        last = match.index + consumed;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes;
};

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
    selfNames?: string[];
    resolveMention?: MentionResolver;
    hasMentionRecord?: boolean;
    selfSuffix?: string;
}

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
        const text = segments[idx - 1]?.type === 'code' ? segment.value.replace(/^\r?\n/, '') : segment.value;
        return (
            <Fragment key={idx}>
                {renderQuoteRuns(text, String(idx), selfNames, resolveMention, hasMentionRecord, selfSuffix)}
            </Fragment>
        );
    });
};
