import { chatAttachmentFormat } from '@chatic/runtime';

/**
 * Putting a file the page holds on the browser's share sheet (the Web Share API), for a browser tab:
 * inside the app the shell shares instead (`ShareFile`).
 *
 * - `shared` — the sheet was shown and a target took it.
 * - `dismissed` — the sheet was closed with no target. Not a failure; nothing to say.
 * - `needs-gesture` — the browser refused because the tap that asked is too far behind: a share has
 *   to start within a short time of the user's press, and fetching the file first can outlast it.
 *   The bytes are in hand by then, so the next press shares at once.
 * - `failed` — the browser cannot share this file, or the share broke.
 */
export type BrowserShareResult = 'shared' | 'dismissed' | 'needs-gesture' | 'failed';

/** The two members read here, so a test can pass its own. */
export type ShareNavigator = Pick<Navigator, 'share' | 'canShare'>;

const browserNavigator = (): ShareNavigator | undefined => (typeof navigator === 'undefined' ? undefined : navigator);

/**
 * The type a shared file carries. Browsers decide by it whether a file may be shared (Chrome keeps a
 * list of formats), and a bucket often answers `application/octet-stream`, so the upload's own name
 * decides when the response named nothing more specific.
 */
const typeOf = (blob: Blob, name: string): string => {
    if (blob.type && blob.type !== 'application/octet-stream') return blob.type;
    return chatAttachmentFormat({ name, type: '' })?.type ?? blob.type;
};

const asFile = (blob: Blob, name: string): File => new File([blob], name, { type: typeOf(blob, name) });

/**
 * Whether this browser shares files at all, asked with a stand-in PDF so the button can be drawn
 * before any bytes are fetched. Most desktop browsers answer no, and the share button is then left out.
 */
export const canShareFilesInBrowser = (nav: ShareNavigator | undefined = browserNavigator()): boolean => {
    if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
    try {
        return nav.canShare({ files: [new File(['%PDF'], 'probe.pdf', { type: 'application/pdf' })] });
    } catch {
        return false;
    }
};

/**
 * Shares `blob` as a file named `name` — the file alone, no title or text, which a receiving app would
 * otherwise take as a second item.
 */
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
