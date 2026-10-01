import { createXhrPut } from './xhrPut';

/** Just the surface `createXhrPut` touches, recording what it was asked to do. */
class FakeRequest {
    method?: string;
    url?: string;
    headers: Record<string, string> = {};
    timeout = 0;
    body?: unknown;
    status = 0;
    responseText = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onabort: (() => void) | null = null;
    open(method: string, url: string) {
        this.method = method;
        this.url = url;
    }
    setRequestHeader(name: string, value: string) {
        this.headers[name] = value;
    }
    send(body: unknown) {
        this.body = body;
    }
}

const setup = () => {
    const request = new FakeRequest();
    const put = createXhrPut(() => request as unknown as XMLHttpRequest);
    return { request, put };
};

const target = {
    url: 'https://bucket.s3.amazonaws.com/key?X-Amz-Signature=abc',
    headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': '12',
        Host: 'bucket.s3.amazonaws.com',
        'x-amz-acl': 'private',
    },
};

const file = new File(['hello world!'], 'a.jpg', { type: 'image/jpeg' });

describe('xhrPut', () => {
    it('PUTs the file to the ticket url with the signed headers, minus the ones the browser owns', async () => {
        const { request, put } = setup();

        const result = put(target, file, 'slot-0/original');
        request.status = 200;
        request.onload?.();

        await expect(result).resolves.toEqual({ kind: 'responded', httpStatus: 200 });
        expect(request.method).toBe('PUT');
        expect(request.url).toBe(target.url);
        expect(request.body).toBe(file);
        expect(request.headers).toEqual({ 'Content-Type': 'image/jpeg', 'x-amz-acl': 'private' });
    });

    it('bounds the PUT with a timeout, so a stalled connection ends as a network failure', () => {
        const { request, put } = setup();

        void put(target, file, 'slot-0/original');

        expect(request.timeout).toBeGreaterThan(0);
    });

    // A 300 MB video over a slow uplink takes far longer than a 20 MB image, and a retry resends it whole.
    it('gives a large file time in proportion to its size', () => {
        const small = setup();
        void small.put(target, file, 'slot-0/original');
        const large = setup();
        const video = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
        Object.defineProperty(video, 'size', { value: 300 * 1024 * 1024 });
        void large.put(target, video, 'slot-0/original');

        expect(small.request.timeout).toBe(5 * 60_000);
        expect(large.request.timeout).toBeGreaterThan(40 * 60_000);
    });

    it('reports an error status with the storage code from the body, without judging it', async () => {
        const { request, put } = setup();

        const result = put(target, file, 'slot-0/original');
        request.status = 403;
        request.responseText = '<?xml version="1.0"?><Error><Code>AccessDenied</Code></Error>';
        request.onload?.();

        await expect(result).resolves.toEqual({ kind: 'responded', httpStatus: 403, providerCode: 'AccessDenied' });
    });

    it.each([
        ['onerror', 'network'],
        ['ontimeout', 'network'],
        ['onabort', 'system'],
    ] as const)('reports %s as no response (%s)', async (handler, reason) => {
        const { request, put } = setup();

        const result = put(target, file, 'slot-0/original');
        request[handler]?.();

        await expect(result).resolves.toEqual({ kind: 'no-response', reason });
    });
});
