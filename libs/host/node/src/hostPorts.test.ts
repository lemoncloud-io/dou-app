import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createFetchPut, nodeHostPorts } from '.';

describe('nodeHostPorts', () => {
    it('prints links, cannot copy, and has no checkout, push or shell', async () => {
        const lines: string[] = [];
        const host = nodeHostPorts({ writeLine: line => lines.push(line) });

        host.links.openUrl('https://example.com/a');
        expect(lines).toEqual(['https://example.com/a']);
        await expect(host.links.copyText('x')).resolves.toBe(false);

        expect(host.checkout).toEqual({ kind: 'none' });
        expect(host.push.deviceToken).toBeNull();
        expect(host.files.transfers).toBeNull();
        expect(host.signIn.sessionScope).toBe('device');
        expect(host.signIn.requestsPairing).toBe(true);
        expect(host.signIn.approvesPairing).toBe(false);
        expect(host.appShell.os).toBeNull();
    });
});

describe('fetch put', () => {
    const serve = (status: number, body = '') =>
        new Promise<{
            url: string;
            received: Promise<{ headers: Record<string, unknown>; body: string }>;
            close: () => void;
        }>(resolve => {
            let deliver: (value: { headers: Record<string, unknown>; body: string }) => void = () => undefined;
            const received = new Promise<{ headers: Record<string, unknown>; body: string }>(done => {
                deliver = done;
            });
            const server = createServer((request, response) => {
                const chunks: Buffer[] = [];
                request.on('data', chunk => chunks.push(chunk as Buffer));
                request.on('end', () => {
                    deliver({ headers: request.headers, body: Buffer.concat(chunks).toString() });
                    response.writeHead(status).end(body);
                });
            });
            server.listen(0, '127.0.0.1', () => {
                const { port } = server.address() as AddressInfo;
                resolve({ url: `http://127.0.0.1:${port}/upload`, received, close: () => server.close() });
            });
        });

    it('puts the file with the target headers and reports the status', async () => {
        const server = await serve(200);
        const progress: number[] = [];
        try {
            const result = await createFetchPut()(
                { url: server.url, headers: { 'x-amz-acl': 'private', Host: 'ignored' } },
                new File(['hello'], 'a.txt'),
                'a',
                sent => progress.push(sent)
            );
            const { headers, body } = await server.received;

            expect(result).toEqual({ kind: 'responded', httpStatus: 200 });
            expect(body).toBe('hello');
            expect(headers['x-amz-acl']).toBe('private');
            expect(progress).toEqual([5]);
        } finally {
            server.close();
        }
    });

    it('reads the provider code from a refusal', async () => {
        const server = await serve(403, '<Error><Code>AccessDenied</Code></Error>');
        try {
            const result = await createFetchPut()({ url: server.url, headers: {} }, new File(['x'], 'a'), 'a');
            expect(result).toEqual({ kind: 'responded', httpStatus: 403, providerCode: 'AccessDenied' });
        } finally {
            server.close();
        }
    });

    it('answers no response on a network failure, a timeout or an aborted signal, and a status with an unreadable body', async () => {
        const failing = createFetchPut(() => Promise.reject(new Error('down')));
        await expect(failing({ url: 'http://x', headers: {} }, new File(['x'], 'a'), 'a')).resolves.toEqual({
            kind: 'no-response',
            reason: 'network',
        });

        const unreadable = createFetchPut(async () => ({
            status: 500,
            text: () => Promise.reject(new Error('reset')),
        }));
        await expect(unreadable({ url: 'http://x', headers: {} }, new File(['x'], 'a'), 'a')).resolves.toEqual({
            kind: 'responded',
            httpStatus: 500,
        });

        const stalled = createFetchPut(
            (_url, init) =>
                new Promise((_resolve, reject) =>
                    init.signal?.addEventListener('abort', () => reject(new Error('timeout')))
                ),
            () => 10
        );
        await expect(stalled({ url: 'http://x', headers: {} }, new File(['x'], 'a'), 'a')).resolves.toEqual({
            kind: 'no-response',
            reason: 'network',
        });

        const aborted = new AbortController();
        aborted.abort();
        await expect(
            failing({ url: 'http://x', headers: {} }, new File(['x'], 'a'), 'a', undefined, aborted.signal)
        ).resolves.toEqual({ kind: 'no-response', reason: 'system' });
    });
});
