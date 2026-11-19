import type { LinksPort } from '@chatic/runtime-client';

/**
 * A browser tab's `links` port for tests: what the page does on its own, with no runner's mock in it —
 * this file loads under jest and vitest alike. A tab opens a link in a new tab and copies with the
 * Clipboard API, and has none of an app's members. A test that needs to watch a member lays its own
 * over this one.
 */
export const browserLinks = (): LinksPort => ({
    kind: 'browser',
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
    shareSheet: null,
    shareIntake: null,
    contacts: null,
    sms: null,
    linkPreview: null,
    subWebView: null,
});
