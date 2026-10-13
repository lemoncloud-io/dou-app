import { Fragment, type ReactNode } from 'react';

import { CodeBlock, InlineCode } from '@chatic/web-ui-kit';

import { type MentionMarks, type MentionPerson, splitMentionRuns } from '../utils/mentionHighlight';
import { tokenizeMessage } from '../utils/messageTokens';
import { openExternalUrl } from '../utils/openExternalUrl';

export interface MessageTextProps {
    text: string;
    /**
     * The text was cut short: a URL running to its end can't be trusted as a full address, and a
     * fence left open at the cut is treated as closed rather than shown as stray backticks.
     */
    truncated?: boolean;
    /** Defaults to `openExternalUrl`. Override to veto the open — see ChannelMessageRow. */
    onUrlClick?: (url: string) => void;
    /**
     * Renders one fenced block. Supplied by the bubble, which wires the copy button; omitted where
     * a copy affordance would be redundant (the expand dialog), leaving the block read-only.
     */
    renderCodeBlock?: (code: string, lang: string | undefined, key: number) => ReactNode;
    /**
     * The mentions to draw, and which of them call me. Marked in plain text alone: a name inside a
     * link or a code span is part of that link or that code.
     */
    mentions?: MentionMarks;
    /** A tap on a mention of a member. Without it a mention is drawn but opens nothing. */
    onMentionClick?: (person: MentionPerson) => void;
    /** The text sits on the page, not in a bubble — a thread's root. See `PAGE_MENTION_CLASS`. */
    onPage?: boolean;
}

/**
 * Every mention is drawn in DoU's brand colours. Anyone else's is coloured text with no chip, the way a
 * phone's chat draws one: brand navy on a light bubble, since lime text does not read on white, and
 * brand lime on a dark one — my own, and every bubble in dark mode. A mention of me is louder, a
 * brand-lime highlight behind navy text, so the eye finds it among the others.
 */
const MENTION_CLASS = 'font-semibold text-brand-ink dark:text-primary';
const OWN_MENTION_CLASS = 'font-semibold text-primary';
const SELF_MENTION_CLASS = 'rounded bg-primary/40 px-1 font-semibold text-brand-ink dark:text-foreground';
/**
 * Text with no bubble behind it — a thread's root, drawn on the page's white — has nothing to set a
 * coloured word apart from the body around it, and my own root has no dark bubble for lime text to
 * read on. There every mention takes a chip, a paler one than a mention of me so that one still reads
 * louder.
 */
const PAGE_MENTION_CLASS = 'rounded bg-primary/20 px-1 font-semibold text-brand-ink dark:text-foreground';

interface PlainTextProps {
    value: string;
    mentions?: MentionMarks;
    onMentionClick?: (person: MentionPerson) => void;
    onPage?: boolean;
}

/** Plain text, with its mentions drawn — a mention of me louder than a mention of anyone else. */
const PlainText = ({ value, mentions, onMentionClick, onPage }: PlainTextProps) => {
    if (!mentions?.words.length) return <>{value}</>;
    const self = new Set(mentions.self.map(word => word.toLowerCase()));
    const classOf = (word: string) =>
        self.has(word.toLowerCase())
            ? SELF_MENTION_CLASS
            : onPage
              ? PAGE_MENTION_CLASS
              : mentions.own
                ? OWN_MENTION_CLASS
                : MENTION_CLASS;
    return (
        <>
            {splitMentionRuns(value, mentions.words).map((run, index) => {
                if (!run.mention) return <Fragment key={index}>{run.value}</Fragment>;
                const person = onMentionClick ? mentions.people.get(run.value.toLowerCase()) : undefined;
                return person ? (
                    <button
                        key={index}
                        type="button"
                        className={`inline ${classOf(run.value)}`}
                        onClick={event => {
                            // The bubble's own taps stay the bubble's.
                            event.stopPropagation();
                            onMentionClick?.(person);
                        }}
                    >
                        {run.value}
                    </button>
                ) : (
                    <span key={index} className={classOf(run.value)}>
                        {run.value}
                    </span>
                );
            })}
        </>
    );
};

/**
 * Message body — plain text, tappable URLs, and code.
 *
 * `href` is kept on links so screen readers announce a link and the OS context menu offers "copy
 * link", but navigation goes through `onUrlClick` rather than the anchor's default: inside the
 * shell the URL has to reach the OS browser, not the webview.
 *
 * Which runs are code is decided by `tokenizeMessage`, which resolves code before URLs — so a link
 * inside a code span renders as literal text here without this component knowing why.
 */
export const MessageText = ({
    text,
    truncated,
    onUrlClick = openExternalUrl,
    renderCodeBlock,
    mentions,
    onMentionClick,
    onPage,
}: MessageTextProps) => (
    <>
        {tokenizeMessage(text, { truncated }).map((token, index) => {
            if (token.type === 'url') {
                return (
                    <a
                        key={index}
                        href={token.value}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="underline underline-offset-2"
                        onClick={event => {
                            event.preventDefault();
                            onUrlClick(token.value);
                        }}
                    >
                        {token.label ?? token.value}
                    </a>
                );
            }
            if (token.type === 'code') return <InlineCode key={index}>{token.value}</InlineCode>;
            if (token.type === 'codeBlock') {
                // No renderCodeBlock: the block is read-only (no copy button) — what the expand
                // dialog wants, where the message already has its own copy affordance.
                return renderCodeBlock ? (
                    <Fragment key={index}>{renderCodeBlock(token.value, token.lang, index)}</Fragment>
                ) : (
                    <CodeBlock key={index} code={token.value} lang={token.lang} />
                );
            }
            return (
                <PlainText
                    key={index}
                    value={token.value}
                    mentions={mentions}
                    onMentionClick={onMentionClick}
                    onPage={onPage}
                />
            );
        })}
    </>
);
