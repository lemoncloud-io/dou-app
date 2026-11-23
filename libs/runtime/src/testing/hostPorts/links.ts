import type { LinksPort } from '@chatic/runtime-client';

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
