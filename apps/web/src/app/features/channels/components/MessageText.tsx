import { Fragment, type ReactNode } from 'react';

import { CodeBlock, InlineCode } from '@chatic/web-ui-kit';

import { type MentionMarks, type MentionPerson, splitMentionRuns } from '../utils/mentionHighlight';
import { tokenizeMessage, type InlineToken } from '@chatic/runtime-react';
import { openExternalUrl } from '../utils/openExternalUrl';

export interface MessageTextProps {
    text: string;
    truncated?: boolean;
    onUrlClick?: (url: string) => void;
    renderCodeBlock?: (code: string, lang: string | undefined, key: number) => ReactNode;
    mentions?: MentionMarks;
    onMentionClick?: (person: MentionPerson) => void;
    onPage?: boolean;
}

const MENTION_CLASS = 'font-semibold text-brand-ink dark:text-primary';
const OWN_MENTION_CLASS = 'font-semibold text-primary';
const SELF_MENTION_CLASS = 'rounded bg-primary/40 px-1 font-semibold text-brand-ink dark:text-foreground';
const PAGE_MENTION_CLASS = 'rounded bg-primary/20 px-1 font-semibold text-brand-ink dark:text-foreground';

interface PlainTextProps {
    value: string;
    mentions?: MentionMarks;
    onMentionClick?: (person: MentionPerson) => void;
    onPage?: boolean;
}

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

const QUOTE_CLASS = 'my-0.5 block border-l-2 border-current pl-2 opacity-75';

export const MessageText = ({
    text,
    truncated,
    onUrlClick = openExternalUrl,
    renderCodeBlock,
    mentions,
    onMentionClick,
    onPage,
}: MessageTextProps) => {
    const plain = (value: string) => (
        <PlainText value={value} mentions={mentions} onMentionClick={onMentionClick} onPage={onPage} />
    );

    const renderInline = (token: InlineToken, key: number): ReactNode => {
        switch (token.type) {
            case 'url':
                return (
                    <a
                        key={key}
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
            case 'code':
                return <InlineCode key={key}>{token.value}</InlineCode>;
            case 'bold':
                return (
                    <strong key={key} className="font-semibold">
                        {token.children.map(renderInline)}
                    </strong>
                );
            case 'italic':
                return <em key={key}>{token.children.map(renderInline)}</em>;
            case 'strike':
                return <s key={key}>{token.children.map(renderInline)}</s>;
            default:
                return <Fragment key={key}>{plain(token.value)}</Fragment>;
        }
    };

    return (
        <>
            {tokenizeMessage(text, { truncated }).map((token, index) => {
                if (token.type === 'codeBlock') {
                    return renderCodeBlock ? (
                        <Fragment key={index}>{renderCodeBlock(token.value, token.lang, index)}</Fragment>
                    ) : (
                        <CodeBlock key={index} code={token.value} lang={token.lang} />
                    );
                }
                if (token.type === 'quote') {
                    return (
                        <span key={index} className={QUOTE_CLASS}>
                            {token.children.map(renderInline)}
                        </span>
                    );
                }
                return renderInline(token, index);
            })}
        </>
    );
};
