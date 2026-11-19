import { isAppleTouchWebKit } from '../utils/attachSources';
import { canShareFilesInBrowser, shareFileInBrowser, type BrowserShareResult } from './browserShare';

/**
 * Saving a file the page holds, in a browser tab.
 *
 * - `saved` — handed over: the browser's download, or a target on the iOS share sheet.
 * - `dismissed` — the iOS share sheet was closed with no target. Nothing to say.
 * - `needs-gesture` — the press that asked is too far behind for the share sheet (`browserShare.ts`).
 *   The caller keeps the bytes; the next press saves at once.
 * - `failed` — the sheet could not take the file.
 */
export type BrowserSaveResult = 'saved' | 'dismissed' | 'needs-gesture' | 'failed';

export interface BrowserSaveDeps {
    /** iOS or iPadOS WebKit — Safari, a home-screen web app, or an in-app browser. */
    appleTouch: () => boolean;
    canShareFiles: () => boolean;
    share: (blob: Blob, name: string) => Promise<BrowserShareResult>;
    /** The browser's own download: a `blob:` address on an anchor with `download`. */
    download: (blob: Blob, name: string) => void;
}

/** The browser's own download, under `name`. */
export const downloadBlob = (blob: Blob, name: string): void => {
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = name;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // The click starts the save synchronously, but some browsers still read the address a moment later.
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
};

const defaultDeps: BrowserSaveDeps = {
    appleTouch: () => isAppleTouchWebKit(),
    canShareFiles: () => canShareFilesInBrowser(),
    share: (blob, name) => shareFileInBrowser(blob, name),
    download: downloadBlob,
};

/**
 * Saves `blob` as `name`. Everywhere but iOS that is the browser's own download. On iOS and iPadOS
 * WebKit it is the share sheet, whose "Save to Files" and "Save Image" are where a file is kept there:
 * a home-screen web app and the in-app browsers (KakaoTalk's among them) do not download a `blob:`
 * address with `download` at all, they show the file in place of the page — no prompt, no way back.
 * Safari's tab asks first, but the sheet is the same answer for all three, so it is used for all of
 * them. An iOS too old to share files falls back to the download.
 */
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
