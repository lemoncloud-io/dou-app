const http = require('http');
const { createUploadTestServer } = require('../upload-test-server');

let server;
let log;
let port;

beforeEach(done => {
    ({ server, log } = createUploadTestServer());
    server.listen(0, () => {
        port = server.address().port;
        done();
    });
});

afterEach(done => {
    server.close(done);
});

/** Sends `body` with the given method and path; resolves with status and body, or rejects on a connection error. */
const send = (method, path, body = Buffer.alloc(0), headers = {}) =>
    new Promise((resolve, reject) => {
        const req = http.request(
            { host: '127.0.0.1', port, method, path, headers: { 'content-length': body.length, ...headers } },
            res => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
            }
        );
        req.on('error', reject);
        req.end(body);
    });

const bytes = n => Buffer.alloc(n, 7);

describe('upload-test-server', () => {
    it('answers 200 on /s3/ok after reading the whole body', async () => {
        const res = await send('PUT', '/s3/ok', bytes(2048));
        expect(res.status).toBe(200);
        expect(log[0]).toMatchObject({ path: '/s3/ok', receivedBytes: 2048, declaredLength: 2048, outcome: 200 });
    });

    it('answers 403 with an AccessDenied body on /s3/expired', async () => {
        const res = await send('PUT', '/s3/expired', bytes(10));
        expect(res.status).toBe(403);
        expect(res.body).toContain('<Code>AccessDenied</Code>');
    });

    it('answers 412 with a PreconditionFailed body on /s3/exists', async () => {
        const res = await send('PUT', '/s3/exists', bytes(10));
        expect(res.status).toBe(412);
        expect(res.body).toContain('<Code>PreconditionFailed</Code>');
    });

    it('reads no faster than the requested rate on /s3/slow', async () => {
        const started = Date.now();
        const res = await send('PUT', '/s3/slow?bps=20000', bytes(10000));
        expect(res.status).toBe(200);
        // 10 000 bytes at 20 000 bytes per second is at least half a second.
        expect(Date.now() - started).toBeGreaterThanOrEqual(450);
    });

    it('drops the connection after the given byte count on /s3/drop', async () => {
        await expect(send('PUT', '/s3/drop?after=1000', bytes(64 * 1024))).rejects.toThrow();
        expect(log[0]).toMatchObject({ path: '/s3/drop', outcome: 'dropped' });
        expect(log[0].receivedBytes).toBeGreaterThanOrEqual(1000);
    });

    it('drops even when the body is shorter than the threshold', async () => {
        await expect(send('PUT', '/s3/drop?after=5000', bytes(100))).rejects.toThrow();
        expect(log[0]).toMatchObject({ outcome: 'dropped', receivedBytes: 100 });
    });

    it('records the headers the client sent and serves them from /s3/_log', async () => {
        await send('PUT', '/s3/ok', bytes(5), { 'x-amz-meta-test': 'kept' });
        const res = await send('GET', '/s3/_log');
        const [entry] = JSON.parse(res.body);
        expect(entry.headers['x-amz-meta-test']).toBe('kept');
        expect(entry.headers['content-length']).toBe('5');
    });

    it('clears the record on DELETE /s3/_log', async () => {
        await send('PUT', '/s3/ok', bytes(5));
        const res = await send('DELETE', '/s3/_log');
        expect(res.status).toBe(204);
        expect(log).toHaveLength(0);
    });

    it('answers 404 with NoSuchKey on an unknown scenario path', async () => {
        const res = await send('PUT', '/s3/nope', bytes(5));
        expect(res.status).toBe(404);
        expect(res.body).toContain('<Code>NoSuchKey</Code>');
    });

    it('rejects methods other than PUT on scenario paths', async () => {
        const res = await send('POST', '/s3/ok', bytes(5));
        expect(res.status).toBe(405);
    });
});
