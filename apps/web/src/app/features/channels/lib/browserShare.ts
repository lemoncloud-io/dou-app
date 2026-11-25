import { chatAttachmentFormat } from '@chatic/runtime-react';

export type BrowserShareResult = 'shared' | 'dismissed' | 'needs-gesture' | 'failed';

export type ShareNavigator = Pick<Navigator, 'share' | 'canShare'>;

const browserNavigator = (): ShareNavigator | undefined => (typeof navigator === 'undefined' ? undefined : navigator);

const typeOf = (blob: Blob, name: string): string => {
    if (blob.type && blob.type !== 'application/octet-stream') return blob.type;
    return chatAttachmentFormat({ name, type: '' })?.type ?? blob.type;
};

const asFile = (blob: Blob, name: string): File => new File([blob], name, { type: typeOf(blob, name) });

export const canShareFilesInBrowser = (nav: ShareNavigator | undefined = browserNavigator()): boolean => {
    if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
    try {
        return nav.canShare({ files: [new File(['%PDF'], 'probe.pdf', { type: 'application/pdf' })] });
    } catch {
        return false;
    }
};

export const shareFileInBrowser = async (
    blob: Blob,
    name: string,
    nav: ShareNavigator | undefined = browserNavigator()
): Promise<BrowserShareResult> => {
    if (!nav || typeof nav.share !== 'function') return 'failed';
    const file = asFile(blob, name);
    if (typeof nav.canShare === 'function' && !nav.canShare({ files: [file] })) return 'failed';
    try {
        await nav.share({ files: [file] });
        return 'shared';
    } catch (error) {
        const errorName = (error as { name?: string } | null)?.name;
        if (errorName === 'AbortError') return 'dismissed';
        if (errorName === 'NotAllowedError') return 'needs-gesture';
        return 'failed';
    }
};
