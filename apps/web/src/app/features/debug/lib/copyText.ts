import { runtime } from '@chatic/runtime';

export const copyTextWithResult = async (value: string | null | undefined): Promise<boolean> => {
    if (!value) return false;

    try {
        return await runtime.links.copyText(value);
    } catch {
        return false;
    }
};

export const copyText = (value: string | null | undefined): void => {
    void copyTextWithResult(value);
};
