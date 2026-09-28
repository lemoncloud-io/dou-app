import type { PutPort, PutResult } from '@chatic/data';

// The browser owns these; the ticket lists them because they are signed, and the value the browser
// sends is the one that was signed.
const USER_AGENT_OWNED_HEADERS = new Set(['content-length', 'host']);

/**
 * The page's own PUT — the same shape `apps/web` uses in a browser, kept here because an app cannot
 * import another app's code. It reports what came back and judges nothing; `sendImageMessage`
 * decides what a status means.
 */
export const xhrPut: PutPort = (target, file) =>
    new Promise<PutResult>(resolve => {
        const request = new XMLHttpRequest();
        request.open('PUT', target.url);
        request.timeout = 5 * 60_000;
        for (const [name, value] of Object.entries(target.headers)) {
            if (!USER_AGENT_OWNED_HEADERS.has(name.toLowerCase())) request.setRequestHeader(name, value);
        }
        request.onload = () => {
            const providerCode =
                request.status >= 300 ? /<Code>([^<]+)<\/Code>/.exec(request.responseText ?? '')?.[1] : undefined;
            resolve({ kind: 'responded', httpStatus: request.status, ...(providerCode ? { providerCode } : {}) });
        };
        request.onerror = () => resolve({ kind: 'no-response', reason: 'network' });
        request.ontimeout = () => resolve({ kind: 'no-response', reason: 'network' });
        request.onabort = () => resolve({ kind: 'no-response', reason: 'system' });
        request.send(file);
    });
