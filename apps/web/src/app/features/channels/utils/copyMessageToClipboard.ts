import { isNative, logger } from '@chatic/bridges';
import { appBridge } from '../../../bridge';

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
        return await appBridge.copyClipBoard(text);
    } catch (error) {
        logger.error('CLIPBOARD', 'Native CopyToClipboard request failed', { error });
        return false;
    }
};
