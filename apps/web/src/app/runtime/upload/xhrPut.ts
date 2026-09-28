import type { PutPort, PutResult } from '@chatic/data';

/**
 * Headers the browser owns. The ticket lists them because they are signed, but `XMLHttpRequest`
 * refuses to set them (with a console warning) and fills them from the request itself — which is
 * the value that was signed, so leaving them out keeps the signature valid.
 */
const USER_AGENT_OWNED_HEADERS = new Set(['content-length', 'host']);

/**
 * A stalled connection (a network handoff, a captive portal) otherwise never ends: with no
 * timeout, `ontimeout` cannot fire. Generous, because it bounds the whole PUT, not a pause in it —
 * 20MB over a slow mobile uplink takes minutes.
 */
const PUT_TIMEOUT_MS = 5 * 60_000;

/** S3 answers an error with an XML body; its `<Code>` is what tells an expiry from a denial. */
const readProviderCode = (body: string): string | undefined => /<Code>([^<]+)<\/Code>/.exec(body)?.[1];

/**
 * PUTs the bytes from the page itself — the web shell's only way, and the old app's fallback when
 * its shell has no transfer module. Uploads started here stop when the page stops.
 *
 * No progress listener: the screen shows no progress, and a listener on `upload` turns every
 * cross-origin PUT into a preflighted one.
 */
export const createXhrPut =
    (createRequest: () => XMLHttpRequest = () => new XMLHttpRequest()): PutPort =>
    (target, file) =>
        new Promise<PutResult>(resolve => {
            const request = createRequest();
            request.open('PUT', target.url);
            request.timeout = PUT_TIMEOUT_MS;
            for (const [name, value] of Object.entries(target.headers)) {
                if (!USER_AGENT_OWNED_HEADERS.has(name.toLowerCase())) request.setRequestHeader(name, value);
            }
            request.onload = () => {
                const providerCode = request.status >= 300 ? readProviderCode(request.responseText ?? '') : undefined;
                resolve({ kind: 'responded', httpStatus: request.status, ...(providerCode ? { providerCode } : {}) });
            };
            // A CORS refusal also lands in `onerror`; from here it is indistinguishable from a
            // dropped connection, and both are worth the same retry.
            request.onerror = () => resolve({ kind: 'no-response', reason: 'network' });
            request.ontimeout = () => resolve({ kind: 'no-response', reason: 'network' });
            request.onabort = () => resolve({ kind: 'no-response', reason: 'system' });
            request.send(file);
        });

export const xhrPut: PutPort = createXhrPut();
