import { Fragment } from 'react';

import { tokenizeLinks } from '../utils/linkTokens';
import { openExternalUrl } from '../utils/openExternalUrl';

export interface LinkedTextProps {
    text: string;
    /** The text was cut short, so a URL running to its end can't be trusted as a full address. */
    truncated?: boolean;
    /** Defaults to `openExternalUrl`. Override to veto the open — see ChannelMessageRow. */
    onUrlClick?: (url: string) => void;
}

/**
 * Message text with tappable URLs.
 *
 * `href` is kept so screen readers announce a link and the OS context menu offers "copy link", but
 * navigation goes through `onUrlClick` rather than the anchor's default: inside the shell the URL
 * has to reach the OS browser, not the webview.
 */
export const LinkedText = ({ text, truncated, onUrlClick = openExternalUrl }: LinkedTextProps) => (
    <>
        {tokenizeLinks(text, { dropTrailingUrl: truncated }).map((token, index) =>
            token.type === 'url' ? (
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
            ) : (
                <Fragment key={index}>{token.value}</Fragment>
            )
        )}
    </>
);
