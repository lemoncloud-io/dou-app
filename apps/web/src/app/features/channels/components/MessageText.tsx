import { Fragment, type ReactNode } from 'react';

import { CodeBlock, InlineCode } from '@chatic/web-ui-kit';

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
}

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
export const MessageText = ({ text, truncated, onUrlClick = openExternalUrl, renderCodeBlock }: MessageTextProps) => (
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
                        {token.value}
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
            return <Fragment key={index}>{token.value}</Fragment>;
        })}
    </>
);
