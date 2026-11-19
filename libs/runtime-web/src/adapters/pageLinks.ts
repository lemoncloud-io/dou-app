import type { LinksPort } from '@chatic/runtime-client';

/**
 * What a page does with a link on its own, in any browser: opens it in a new tab, cut off from the page
 * (`noopener,noreferrer`), and copies with the Clipboard API. Every app's page side of the `links` port
 * starts from these, and so does a shell that leaves both to the page (the desktop app answers neither
 * `OpenURL` nor `CopyToClipboard`).
 *
 * `copyText` rejects where the Clipboard API is missing — a non-secure context, an old WebView — rather
 * than answering `false`: a caller that has a fallback of its own can tell "no clipboard" from "the copy
 * failed".
 */
export const pageLinks: Pick<LinksPort, 'openUrl' | 'copyText'> = {
    openUrl: url => {
        window.open(url, '_blank', 'noopener,noreferrer');
    },
    copyText: async text => {
        if (!navigator.clipboard?.writeText) {
            throw new Error('Clipboard API is not available.');
        }
        await navigator.clipboard.writeText(text);
        return true;
    },
};
