import { saveFileInBrowser, type BrowserSaveResult } from './browserSave';

export type BrowserDownloadResult = 'saved' | 'expired' | 'failed' | 'cancelled' | 'dismissed' | 'needs-gesture';

export type BrowserFetchResult =
    | { kind: 'blob'; blob: Blob }
    | { kind: 'expired' }
    | { kind: 'failed' }
    | { kind: 'cancelled' };

export interface BrowserDownloadDeps {
    fetch: (url: string, signal?: AbortSignal) => Promise<Response>;
    save: (blob: Blob, name: string) => Promise<BrowserSaveResult>;
}

const defaultDeps: BrowserDownloadDeps = {
    fetch: (url, signal) => fetch(url, { signal, mode: 'cors', credentials: 'omit', cache: 'no-store' }),
    save: (blob, name) => saveFileInBrowser(blob, name),
};

const readBody = async (response: Response, onProgress?: (fraction: number) => void): Promise<Blob> => {
    const total = Number(response.headers?.get('content-length') ?? 0);
    const reader = onProgress && total > 0 ? response.body?.getReader() : undefined;
    if (!reader) return response.blob();
    const chunks: Uint8Array[] = [];
    let received = 0;
    let reportedPercent = -1;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        const fraction = Math.min(1, received / total);
        const percent = Math.floor(fraction * 100);
        if (percent !== reportedPercent) {
            reportedPercent = percent;
            onProgress?.(fraction);
        }
    }
    return new Blob(chunks as BlobPart[], { type: response.headers.get('content-type') ?? '' });
};

export const fetchInBrowser = async (
    url: string,
    {
        signal,
        onProgress,
        deps = defaultDeps,
    }: { signal?: AbortSignal; onProgress?: (fraction: number) => void; deps?: Pick<BrowserDownloadDeps, 'fetch'> } = {}
): Promise<BrowserFetchResult> => {
    let response: Response;
    try {
        response = await deps.fetch(url, signal);
    } catch {
        return { kind: signal?.aborted ? 'cancelled' : 'failed' };
    }
    if (response.status === 403) return { kind: 'expired' };
    if (!response.ok) return { kind: 'failed' };
    try {
        return { kind: 'blob', blob: await readBody(response, onProgress) };
    } catch {
        return { kind: signal?.aborted ? 'cancelled' : 'failed' };
    }
};

export const downloadInBrowser = async (
    url: string,
    name: string,
    {
        signal,
        onProgress,
        held,
        onHeld,
        deps = defaultDeps,
    }: {
        signal?: AbortSignal;
        onProgress?: (fraction: number) => void;
        held?: Blob;
        onHeld?: (blob: Blob) => void;
        deps?: BrowserDownloadDeps;
    } = {}
): Promise<BrowserDownloadResult> => {
    let blob = held;
    if (!blob) {
        const result = await fetchInBrowser(url, { signal, onProgress, deps });
        if (result.kind !== 'blob') return result.kind;
        blob = result.blob;
    }
    const saved = await deps.save(blob, name);
    if (saved === 'needs-gesture') onHeld?.(blob);
    return saved;
};
