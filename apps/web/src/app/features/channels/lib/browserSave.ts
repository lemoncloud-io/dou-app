import { isAppleTouchWebKit } from '../utils/attachSources';
import { canShareFilesInBrowser, shareFileInBrowser, type BrowserShareResult } from './browserShare';

export type BrowserSaveResult = 'saved' | 'dismissed' | 'needs-gesture' | 'failed';

export interface BrowserSaveDeps {
    appleTouch: () => boolean;
    canShareFiles: () => boolean;
    share: (blob: Blob, name: string) => Promise<BrowserShareResult>;
    download: (blob: Blob, name: string) => void;
}

export const downloadBlob = (blob: Blob, name: string): void => {
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = name;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
};

const defaultDeps: BrowserSaveDeps = {
    appleTouch: () => isAppleTouchWebKit(),
    canShareFiles: () => canShareFilesInBrowser(),
    share: (blob, name) => shareFileInBrowser(blob, name),
    download: downloadBlob,
};

export const saveFileInBrowser = async (
    blob: Blob,
    name: string,
    deps: BrowserSaveDeps = defaultDeps
): Promise<BrowserSaveResult> => {
    if (deps.appleTouch() && deps.canShareFiles()) {
        const shared = await deps.share(blob, name);
        return shared === 'shared' ? 'saved' : shared;
    }
    deps.download(blob, name);
    return 'saved';
};
