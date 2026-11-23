import type { PutPort, PutResult } from '@chatic/data';

const USER_AGENT_OWNED_HEADERS = new Set(['content-length', 'host']);

const MIN_PUT_TIMEOUT_MS = 5 * 60_000;
const SLOW_UPLINK_BYTES_PER_MS = 1_000_000 / 8 / 1000;

const putTimeoutMs = (size: number): number => Math.max(MIN_PUT_TIMEOUT_MS, Math.ceil(size / SLOW_UPLINK_BYTES_PER_MS));

const readProviderCode = (body: string): string | undefined => /<Code>([^<]+)<\/Code>/.exec(body)?.[1];

export const createXhrPut =
    (createRequest: () => XMLHttpRequest = () => new XMLHttpRequest()): PutPort =>
    (target, file, _label, onProgress, signal) =>
        new Promise<PutResult>(resolve => {
            if (signal?.aborted) {
                resolve({ kind: 'no-response', reason: 'system' });
                return;
            }
            const request = createRequest();
            request.open('PUT', target.url);
            request.timeout = putTimeoutMs(file.size);
            for (const [name, value] of Object.entries(target.headers)) {
                if (!USER_AGENT_OWNED_HEADERS.has(name.toLowerCase())) request.setRequestHeader(name, value);
            }
            request.onload = () => {
                const providerCode = request.status >= 300 ? readProviderCode(request.responseText ?? '') : undefined;
                resolve({ kind: 'responded', httpStatus: request.status, ...(providerCode ? { providerCode } : {}) });
            };
            request.onerror = () => resolve({ kind: 'no-response', reason: 'network' });
            request.ontimeout = () => resolve({ kind: 'no-response', reason: 'network' });
            request.onabort = () => resolve({ kind: 'no-response', reason: 'system' });
            if (onProgress) request.upload.onprogress = event => onProgress(event.loaded);
            signal?.addEventListener('abort', () => request.abort(), { once: true });
            request.send(file);
        });

export const xhrPut: PutPort = createXhrPut();
