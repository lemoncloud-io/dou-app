import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime';
import { appBridge } from '../../../bridge';

const writeWithBrowserClipboard = async (text: string) => {
    if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API is not available.');
    }

    await navigator.clipboard.writeText(text);
};

export const copyMessageToClipboard = async (text: string) => {
    if (!text) return false;

    // The clipboard is the app's where it takes the page's links (`runtime.links`).
    if (runtime.links.kind !== 'shell') {
        await writeWithBrowserClipboard(text);
        return true;
    }

    try {
        return await appBridge.copyClipBoard(text);
    } catch (error) {
        logger.error('CLIPBOARD', 'Native CopyToClipboard request failed', { error });
        return false;
    }
};
