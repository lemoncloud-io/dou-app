import type { RawPut } from 'lemon-model/upload/engine';

/**
 * Headers the user agent owns. `setRequestHeader` on either one throws or is ignored, and a
 * presigned instruction carries `content-length` because the signature covers it — so the shell
 * drops both and lets the browser fill them. The signature still matches: what the browser sends is
 * the value that was signed.
 */
const UA_HEADERS = ['content-length', 'host'];

/** S3 answers an error as XML; the `<Code>` is what the engine normalizes into a failure code. */
const S3_ERROR_CODE = /<Code>([^<]+)<\/Code>/;

/**
 * How long one transfer may stay silent before the shell gives up on it.
 *
 * Without a ceiling a socket that opens and then goes quiet never settles, and neither does the
 * batch waiting on it: the composer's tray sits at "uploading" with no way back. Fifteen minutes is
 * far longer than any allowed attachment needs on a usable connection, and still well inside the
 * presigned url's own lifetime — a transfer that outlives the url would fail at S3 anyway.
 */
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

export interface XhrRawPutOptions {
    /** Silence ceiling per transfer. 0 disables it. */
    timeoutMs?: number;
    /**
     * Cancels every transfer this instance starts, and refuses new ones.
     *
     * Batch-scoped on purpose: the action a person takes is "stop sending these", not "stop file
     * three". The upload contract has no per-slot cancel yet (its executor signature takes no
     * signal), so this is the seam that exists without bending the contract.
     */
    signal?: AbortSignal;
}

const setHeaders = (xhr: XMLHttpRequest, headers: Record<string, string>): void => {
    Object.keys(headers)
        .filter(name => UA_HEADERS.indexOf(name.toLowerCase()) < 0)
        .forEach(name => xhr.setRequestHeader(name, headers[name]));
};

/**
 * A presigned PUT, over `XMLHttpRequest` rather than `fetch`.
 *
 * `fetch` cannot report request-body progress — `XMLHttpRequest.upload.onprogress` is the only
 * client API that does, and the progress bar is the whole reason this primitive belongs to the
 * shell instead of the engine.
 *
 * **It never rejects and always settles.** Transport failure, timeout and cancellation all resolve
 * as `status: 0`, which the engine reads as a network failure for that one slot. Throwing would put
 * the whole batch at the mercy of one socket; hanging would strand the tray forever.
 *
 * The url is a credential: it is never logged, stored, or put in a message.
 */
export const createXhrRawPut =
    ({ timeoutMs = DEFAULT_TIMEOUT_MS, signal }: XhrRawPutOptions = {}): RawPut =>
    (url, headers, body, onProgress) =>
        new Promise(resolve => {
            if (signal?.aborted) {
                resolve({ status: 0 });
                return;
            }

            const xhr = new XMLHttpRequest();
            let settled = false;
            const settle = (result: { status: number; code?: string }) => {
                if (settled) return;
                settled = true;
                signal?.removeEventListener('abort', onAbort);
                resolve(result);
            };
            const onAbort = () => {
                // `abort()` fires `onabort`, which is not wired; settling here keeps the promise honest
                // even on a browser that swallows the event.
                xhr.abort();
                settle({ status: 0 });
            };

            xhr.open('PUT', url);
            setHeaders(xhr, headers);
            if (timeoutMs > 0) xhr.timeout = timeoutMs;
            if (onProgress) {
                xhr.upload.onprogress = event => {
                    if (event.lengthComputable) onProgress(event.loaded, event.total);
                };
            }
            xhr.onload = () => {
                const match = xhr.status >= 300 ? S3_ERROR_CODE.exec(xhr.responseText || '') : null;
                settle({ status: xhr.status, code: match ? match[1] : undefined });
            };
            xhr.onerror = () => settle({ status: 0 });
            xhr.ontimeout = () => settle({ status: 0 });
            xhr.onabort = () => settle({ status: 0 });
            signal?.addEventListener('abort', onAbort);
            xhr.send(body as unknown as XMLHttpRequestBodyInit);
        });

/** The default instance: a silence ceiling, no cancellation. */
export const xhrRawPut: RawPut = createXhrRawPut();
