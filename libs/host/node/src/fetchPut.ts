import type { FilesPort } from '@chatic/ports';

type PutPort = FilesPort['put'];
type PutResponse = Pick<Response, 'status' | 'text'> & { body?: { cancel(): Promise<void> } | null };
type Fetch = (url: string, init: RequestInit) => Promise<PutResponse>;

const USER_AGENT_OWNED_HEADERS = new Set(['content-length', 'host']);

const MIN_PUT_TIMEOUT_MS = 5 * 60_000;
const SLOW_UPLINK_BYTES_PER_MS = 1_000_000 / 8 / 1000;

export const putTimeoutMs = (size: number): number =>
    Math.max(MIN_PUT_TIMEOUT_MS, Math.ceil(size / SLOW_UPLINK_BYTES_PER_MS));

const readProviderCode = async (response: PutResponse): Promise<string | undefined> => {
    try {
        return /<Code>([^<]+)<\/Code>/.exec(await response.text())?.[1];
    } catch {
        return undefined;
    }
};

export const createFetchPut =
    (request: Fetch = (url, init) => fetch(url, init), timeoutMs: (size: number) => number = putTimeoutMs): PutPort =>
    async (target, file, _label, onProgress, signal) => {
        if (signal?.aborted) return { kind: 'no-response', reason: 'system' };
        const headers = Object.fromEntries(
            Object.entries(target.headers).filter(([name]) => !USER_AGENT_OWNED_HEADERS.has(name.toLowerCase()))
        );
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs(file.size));
        const forward = (): void => controller.abort();
        signal?.addEventListener('abort', forward, { once: true });
        let response: PutResponse;
        try {
            response = await request(target.url, { method: 'PUT', headers, body: file, signal: controller.signal });
        } catch {
            return { kind: 'no-response', reason: signal?.aborted ? 'system' : 'network' };
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', forward);
        }
        onProgress?.(file.size);
        if (response.status < 300) {
            await response.body?.cancel().catch(() => undefined);
            return { kind: 'responded', httpStatus: response.status };
        }
        const providerCode = await readProviderCode(response);
        return { kind: 'responded', httpStatus: response.status, ...(providerCode ? { providerCode } : {}) };
    };

export const fetchPut: PutPort = createFetchPut();
