import { logger } from '@chatic/bridges';
import { host } from '@chatic/host';
import { appBridge } from '../../../bridge';

const writeWithBrowserClipboard = async (text: string) => {
    if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API is not available.');
    }

    await navigator.clipboard.writeText(text);
};

export const copyMessageToClipboard = async (text: string) => {
    if (!text) return false;

    // The clipboard is the app's where it takes the page's links (`host.ports.links`).
    if (host.ports.links.kind !== 'app') {
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
