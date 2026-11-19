/**
 * A file downloaded from the page, kept under its own name — the browser's way, and the only one.
 *
 * An anchor's `download` attribute names the file only for a same-origin address, and the signed
 * address is the storage bucket's, so pointing an anchor at it would open the file (or save it under
 * the object key). The bytes are fetched into a `Blob` first, then saved from a local address that
 * the attribute does apply to. The whole file sits in memory meanwhile, which the 50MB document limit
 * keeps affordable.
 *
 * Inside the app's WebView this does not work at all — it ignores `download` — so the app saves through
 * the shell instead, and an app too old for that shows an update notice rather than this.
 */

export type BrowserDownloadResult = 'saved' | 'expired' | 'failed' | 'cancelled';

/** The bytes, or why there are none: a 403 is `expired` (the signed address outlived its time). */
export type BrowserFetchResult =
    | { kind: 'blob'; blob: Blob }
    | { kind: 'expired' }
    | { kind: 'failed' }
    | { kind: 'cancelled' };

export interface BrowserDownloadDeps {
    fetch: (url: string, signal?: AbortSignal) => Promise<Response>;
    /** Saves the blob under `name`. Injected for tests; the default clicks a temporary anchor. */
    save: (blob: Blob, name: string) => void;
}

/** Saves bytes the page already holds under `name`, as the browser's own download. */
export const saveBlob = (blob: Blob, name: string): void => {
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

const defaultDeps: BrowserDownloadDeps = {
    // `no-store`: a photo's tile or viewer may already have loaded this address through `<img>`, and
    // that copy in the HTTP cache carries no CORS headers. A fetch answered from it fails as if the
    // bucket sent none, so the fetch always goes to the network.
    fetch: (url, signal) => fetch(url, { signal, mode: 'cors', credentials: 'omit', cache: 'no-store' }),
    save: saveBlob,
};

/**
 * Reads the body, reporting how far it has got when the length is known — once per whole percent, since
 * each report re-renders the caller and a long video arrives in thousands of chunks. A response without
 * a readable stream (an old engine, a test double) is read whole.
 */
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

/**
 * Fetches `url` into memory. A 403 is `expired` — the caller reads the message again for a fresh
 * address — every other failure is `failed`, and a stop through `signal` is `cancelled`.
 */
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

/** Fetches `url` and saves it as `name`. */
export const downloadInBrowser = async (
    url: string,
    name: string,
    {
        signal,
        onProgress,
        deps = defaultDeps,
    }: { signal?: AbortSignal; onProgress?: (fraction: number) => void; deps?: BrowserDownloadDeps } = {}
): Promise<BrowserDownloadResult> => {
    const result = await fetchInBrowser(url, { signal, onProgress, deps });
    if (result.kind !== 'blob') return result.kind;
    deps.save(result.blob, name);
    return 'saved';
};
