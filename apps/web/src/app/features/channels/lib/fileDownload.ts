/**
 * A document downloaded from the page, kept under its own name — the browser's way, and the only one.
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

export interface BrowserDownloadDeps {
    fetch: (url: string, signal?: AbortSignal) => Promise<Response>;
    /** Saves the blob under `name`. Injected for tests; the default clicks a temporary anchor. */
    save: (blob: Blob, name: string) => void;
}

const saveWithAnchor = (blob: Blob, name: string) => {
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
    fetch: (url, signal) => fetch(url, { signal }),
    save: saveWithAnchor,
};

/**
 * Fetches `url` and saves it as `name`. A 403 is `expired` — the signed address outlived its time, and
 * the caller reads the message again for a fresh one — every other failure is `failed`.
 */
export const downloadInBrowser = async (
    url: string,
    name: string,
    { signal, deps = defaultDeps }: { signal?: AbortSignal; deps?: BrowserDownloadDeps } = {}
): Promise<BrowserDownloadResult> => {
    let response: Response;
    try {
        response = await deps.fetch(url, signal);
    } catch {
        return signal?.aborted ? 'cancelled' : 'failed';
    }
    if (response.status === 403) return 'expired';
    if (!response.ok) return 'failed';
    let blob: Blob;
    try {
        blob = await response.blob();
    } catch {
        return signal?.aborted ? 'cancelled' : 'failed';
    }
    deps.save(blob, name);
    return 'saved';
};
