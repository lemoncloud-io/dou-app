import type { BrowserSaveResult } from './browserSave';
import type { BrowserShareResult } from './browserShare';
import type { BrowserFetchResult } from './fileDownload';

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
    freshUrl(): Promise<string | undefined>;
    save(blob: Blob, name: string): Promise<BrowserSaveResult>;
    share(blob: Blob, name: string): Promise<BrowserShareResult>;
}

export interface BrowserMediaInput {
    action: 'save' | 'share';
    url: string;
    name?: string;
    uploadId: string;
    kind: 'image' | 'video';
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
