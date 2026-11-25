import { runtime } from '@chatic/runtime-react';

export const copyMessageToClipboard = async (text: string): Promise<boolean> => {
    if (!text) return false;
    return runtime.links.copyText(text);
};
