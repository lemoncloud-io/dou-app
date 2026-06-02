import { isNative, logger, webClient } from '@chatic/bridges';

const writeWithBrowserClipboard = async (text: string) => {
    if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API is not available.');
    }

    await navigator.clipboard.writeText(text);
};

export const copyMessageToClipboard = async (text: string) => {
    if (!text) return false;

    if (!isNative()) {
        await writeWithBrowserClipboard(text);
        return true;
    }

    try {
        await webClient.request({
            type: 'CopyToClipboard',
            data: { text },
        });
        return true;
    } catch (error) {
        logger.error('CLIPBOARD', 'Native CopyToClipboard request failed', { error });

        // Web can ship before the native app that supports this bridge message.
        // Keep browser clipboard fallback here so newer web bundles degrade cleanly on old apps when available.
        await writeWithBrowserClipboard(text);
        return true;
    }
};
