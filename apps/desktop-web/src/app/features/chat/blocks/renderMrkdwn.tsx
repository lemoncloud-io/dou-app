import { Fragment, type ReactNode } from 'react';

import { SLACK_MARKS, decodeSlackEntities, markPattern } from '../../../shared';
import { MSG_BOLD_CLASS, MSG_CODE_BLOCK_CLASS, MSG_CODE_INLINE_CLASS, MSG_MENTION_CLASS } from '../components/RichText';

/**
 * Slack's mrkdwn, which is not the dialect the composer writes. `*x*` is bold
 * here and italic in `RichText`; `~x~` strikes here and needs doubling there.
 * The two parsers therefore stay apart — the styles are shared, the grammar is
 * not.
 *
 * The mark alternatives come from `markPattern`, the same source the flattener
 * compiles, so "what counts as a mark" has one definition rather than two that
 * have to be kept in step. Each contributes two groups: the character in front
 * of the mark, which is put back as text, and the content between delimiters.
 */
const INLINE = new RegExp(
    [
        '(<[^<>|]+\\|[^<>]*>)', // 1: <url|label>
        '(<[@!][^<>|]+>)', // 2: <@U123>, <!here>
        '(<[^<>|]+>)', // 3: <url>
        ...SLACK_MARKS.map(markPattern), // 4,5 bold · 6,7 italic · 8,9 strike
    ].join('|'),
    'gu'
);

const linkTo = (href: string, label: string, key: string): ReactNode => (
    <a
        key={key}
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="text-primary-ink underline-offset-2 hover:underline"
    >
        {label}
    </a>
);

const renderInline = (text: string, keyBase: string): ReactNode[] => {
    const nodes: ReactNode[] = [];
    let last = 0;
    INLINE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = INLINE.exec(text)) !== null) {
        const [token, labelled, mention, bare, boldLead, bold, italicLead, italic, strikeLead, strike] = match;
        const lead = boldLead ?? italicLead ?? strikeLead ?? '';
        const key = `${keyBase}-${match.index}`;
        // The captured lead character belongs to the run before the mark, not to
        // the mark — decoding it as part of that run keeps a `&amp;` sitting right
        // in front of a mark from being split down the middle.
        const before = text.slice(last, match.index + lead.length);
        if (before) nodes.push(decodeSlackEntities(before));
        if (labelled) {
            const split = labelled.indexOf('|');
            nodes.push(linkTo(labelled.slice(1, split), decodeSlackEntities(labelled.slice(split + 1, -1)), key));
        } else if (mention) {
            // No directory to resolve `U123` against — Slack's own id is the best
            // name we have, and it still reads as a mention.
            nodes.push(
                <span key={key} className={MSG_MENTION_CLASS}>
                    {`@${mention.slice(2, -1)}`}
                </span>
            );
        } else if (bare) {
            nodes.push(linkTo(bare.slice(1, -1), bare.slice(1, -1), key));
        } else if (bold) {
            nodes.push(
                <strong key={key} className={MSG_BOLD_CLASS}>
                    {decodeSlackEntities(bold)}
                </strong>
            );
        } else if (italic) {
            nodes.push(<em key={key}>{decodeSlackEntities(italic)}</em>);
        } else {
            nodes.push(<s key={key}>{decodeSlackEntities(strike)}</s>);
        }
        last = match.index + token.length;
    }
    if (last < text.length) nodes.push(decodeSlackEntities(text.slice(last)));
    return nodes;
};

// Backtick spans split out first so marks inside them stay literal — odd split
// indices are the captured spans, the same shape `RichText` uses.
const renderCodeRuns = (text: string, keyBase: string): ReactNode[] =>
    text.split(/(`[^`\n]+`)/g).map((part, idx) =>
        idx % 2 === 1 ? (
            <code key={`${keyBase}-${idx}`} className={MSG_CODE_INLINE_CLASS}>
                {part.slice(1, -1)}
            </code>
        ) : (
            <Fragment key={`${keyBase}-${idx}`}>{renderInline(part, `${keyBase}-${idx}`)}</Fragment>
        )
    );

export const renderMrkdwn = (text: string): ReactNode =>
    text.split(/(```[\s\S]*?```)/g).map((part, idx) => {
        if (idx % 2 === 1) {
            const inner = part.slice(3, -3).replace(/^\n/, '').replace(/\n$/, '');
            return (
                <span key={idx} className={MSG_CODE_BLOCK_CLASS}>
                    {decodeSlackEntities(inner)}
                </span>
            );
        }
        return <Fragment key={idx}>{renderCodeRuns(part, String(idx))}</Fragment>;
    });
