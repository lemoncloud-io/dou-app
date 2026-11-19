import { runtime } from '@chatic/runtime';

/**
 * Copies `text`, as the host copies (`runtime.links.copyText`). Resolves `false` for empty text and for
 * a copy the app failed; rejects where the page's Clipboard API is missing or refuses the write.
 */
export const copyMessageToClipboard = async (text: string): Promise<boolean> => {
    if (!text) return false;
    return runtime.links.copyText(text);
};
