import type { BrowserSaveResult } from './browserSave';
import type { BrowserShareResult } from './browserShare';
import type { BrowserFetchResult } from './fileDownload';

/**
 * Save and share for one photo or video in a browser tab, where the page — not the shell — fetches
 * the original. Inside the app the shell downloads it instead (`imageExport.ts`).
 *
 * - `saved` — the browser was handed the file as a download (on iOS, a target on the share sheet took
 *   it); that UI is the feedback.
 * - `shared` / `dismissed` — the share sheet was shown; nothing to say either way.
 * - `needs-gesture` — fetching took longer than the browser lets the share sheet follow its press (a
 *   share, or a save on iOS). The bytes are returned (`held`) so the next press uses them at once.
 * - `failed` — the original could not be fetched (CORS, offline, a second 403) or shared.
 * - `cancelled` — stopped through the signal (the viewer closed on a share).
 */
export type BrowserMediaOutcome =
    | { kind: 'saved' }
    | { kind: 'shared' }
    | { kind: 'dismissed' }
    | { kind: 'needs-gesture'; held: Blob }
    | { kind: 'failed' }
    | { kind: 'cancelled' };

export interface BrowserMediaDeps {
    fetch(
        url: string,
        options: { signal?: AbortSignal; onProgress?: (fraction: number) => void }
    ): Promise<BrowserFetchResult>;
    /** Reads the message again and returns this upload's fresh address, if any. */
    freshUrl(): Promise<string | undefined>;
    save(blob: Blob, name: string): Promise<BrowserSaveResult>;
    share(blob: Blob, name: string): Promise<BrowserShareResult>;
}

export interface BrowserMediaInput {
    action: 'save' | 'share';
    url: string;
    /** The name it was sent under; absent on an upload older than names (`mediaFileName`). */
    name?: string;
    uploadId: string;
    kind: 'image' | 'video';
    /** Bytes an earlier share fetched and could not hand over in time. Used instead of fetching. */
    held?: Blob;
    signal?: AbortSignal;
    onProgress?: (fraction: number) => void;
}

const EXTENSION_BY_TYPE: Readonly<Record<string, string>> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
};

/**
 * The name a photo or video is saved and shared under: the one it was sent with, or — for an upload
 * older than names — its upload id with the extension its type gives, so the file still opens as a
 * photo. `kind` decides the extension when the type says nothing useful.
 */
export const mediaFileName = (
    name: string | undefined,
    uploadId: string,
    kind: 'image' | 'video',
    type: string | undefined
): string => {
    if (name) return name;
    const extension = (type ? EXTENSION_BY_TYPE[type] : undefined) ?? (kind === 'video' ? 'mp4' : 'jpg');
    return `${uploadId}.${extension}`;
};

/**
 * Fetches the original and saves or shares it. A 403 reads the message again once for a fresh
 * address; a second one is a failure.
 */
export const exportMediaInBrowser = async (
    { action, url, name, uploadId, kind, held, signal, onProgress }: BrowserMediaInput,
    deps: BrowserMediaDeps
): Promise<BrowserMediaOutcome> => {
    let blob = held;
    if (!blob) {
        let result = await deps.fetch(url, { signal, onProgress });
        if (result.kind === 'expired') {
            const fresh = await deps.freshUrl().catch(() => undefined);
            if (!fresh || fresh === url) return { kind: 'failed' };
            result = await deps.fetch(fresh, { signal, onProgress });
        }
        if (result.kind === 'cancelled') return { kind: 'cancelled' };
        if (result.kind !== 'blob') return { kind: 'failed' };
        blob = result.blob;
    }
    if (signal?.aborted) return { kind: 'cancelled' };
    const fileName = mediaFileName(name, uploadId, kind, blob.type);
    const handed = action === 'save' ? await deps.save(blob, fileName) : await deps.share(blob, fileName);
    if (handed === 'needs-gesture') return { kind: 'needs-gesture', held: blob };
    return { kind: handed };
};
