const http = require('http');
const { createUploadTestServer, presignConfig, presignPut } = require('../upload-test-server');

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

    it('rejects methods other than PUT and GET on scenario paths', async () => {
        const res = await send('POST', '/s3/ok', bytes(5));
        expect(res.status).toBe(405);
    });
});

/** A GET; resolves with status, headers and the raw body, or rejects on a connection error. */
const get = (path, headers = {}) =>
    new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port, path, headers }, res => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
            res.on('error', reject);
        }).on('error', reject);
    });

describe('upload-test-server downloads', () => {
    const magic = {
        png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        jpeg: [0xff, 0xd8, 0xff],
        gif: [...Buffer.from('GIF89a')],
        webp: [...Buffer.from('RIFF')],
    };

    it.each(Object.keys(magic))('serves a real %s with its Content-Length on /s3/image', async format => {
        const res = await get(`/s3/image?format=${format}`);
        expect(res.status).toBe(200);
        expect(Number(res.headers['content-length'])).toBe(res.body.length);
        expect([...res.body.subarray(0, magic[format].length)]).toEqual(magic[format]);
    });

    it('sizes the png by px, so progress has room to show', async () => {
        const small = await get('/s3/image?px=16');
        const large = await get('/s3/image?px=256');
        expect(large.body.length).toBeGreaterThan(small.body.length * 100);
    });

    it('records the request headers, so Accept-Encoding: identity can be checked', async () => {
        await get('/s3/image', { 'accept-encoding': 'identity' });
        expect(log[0]).toMatchObject({ method: 'GET', path: '/s3/image', outcome: 200 });
        expect(log[0].headers['accept-encoding']).toBe('identity');
    });

    it('sends /s3/image-chunked without a Content-Length', async () => {
        const res = await get('/s3/image-chunked');
        expect(res.status).toBe(200);
        expect(res.headers['content-length']).toBeUndefined();
        expect(res.headers['transfer-encoding']).toBe('chunked');
        expect([...res.body.subarray(0, 3)]).toEqual(magic.jpeg);
    });

    it('answers GET /s3/expired with 403 and an AccessDenied body', async () => {
        const res = await get('/s3/expired');
        expect(res.status).toBe(403);
        expect(res.body.toString()).toContain('<Code>AccessDenied</Code>');
    });

    it('sends /s3/slow no faster than the requested rate', async () => {
        const started = Date.now();
        const res = await get('/s3/slow?bps=40000&px=64');
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(Number(res.headers['content-length']));
        // A 64×64 noise png is over 12 000 bytes; at 40 000 bytes per second that is 300 ms or more.
        expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    });

    it('declares the whole body on /s3/drop and cuts the connection part-way', async () => {
        const received = await new Promise(resolve => {
            http.get({ host: '127.0.0.1', port, path: '/s3/drop?after=1000' }, res => {
                let length = 0;
                res.on('data', chunk => (length += chunk.length));
                res.on('aborted', () => resolve({ declared: Number(res.headers['content-length']), length }));
                res.on('error', () => resolve({ declared: Number(res.headers['content-length']), length }));
            });
        });
        expect(received.length).toBe(1000);
        expect(received.declared).toBeGreaterThan(1000);
        expect(log[0]).toMatchObject({ path: '/s3/drop', outcome: 'dropped' });
    });

    it('answers /s3/html with a 200 page that is not an image', async () => {
        const res = await get('/s3/html');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('text/html');
        expect(res.body.toString()).toContain('<html>');
    });

    it('answers 404 on an unknown download path', async () => {
        expect((await get('/s3/nope')).status).toBe(404);
    });
});

describe('upload-test-server presign', () => {
    const signed = {
        endpoint: 'http://localhost:9000',
        bucket: 'transfer-test',
        key: 'debug/a b.bin',
        region: 'us-east-1',
        accessKey: 'AKID',
        secretKey: 'SECRET',
        contentType: 'image/jpeg',
        contentLength: 1048576,
        expires: 900,
        now: new Date('2026-09-28T02:00:00Z'),
    };

    // Pinned after the same code's URLs were accepted by a live MinIO — including a key with a space
    // and parentheses, and a mismatched Content-Type or length rejected with SignatureDoesNotMatch.
    it('produces the SigV4 query signature MinIO accepted', () => {
        const { url, headers } = presignPut(signed);
        expect(url).toBe(
            'http://localhost:9000/transfer-test/debug/a%20b.bin?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
                '&X-Amz-Credential=AKID%2F20260928%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260928T020000Z' +
                '&X-Amz-Expires=900&X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost' +
                '&X-Amz-Signature=3ffc9c4658491d827b3737c6f2410868f8eb05a973e6edb6e7ff4705401893b0'
        );
        expect(headers).toEqual({ 'content-type': 'image/jpeg', 'content-length': '1048576' });
    });

    it('signs every value it is given, so changing one changes the signature', () => {
        const base = presignPut(signed).url;
        expect(presignPut({ ...signed, contentType: 'application/octet-stream' }).url).not.toBe(base);
        expect(presignPut({ ...signed, contentLength: 1048575 }).url).not.toBe(base);
        expect(presignPut({ ...signed, endpoint: 'http://192.168.1.2:9000' }).url).not.toBe(base);
    });

    it('is off unless the three required variables are set', () => {
        expect(presignConfig({})).toBeNull();
        expect(presignConfig({ PRESIGN_ACCESS_KEY: 'a', PRESIGN_SECRET_KEY: 'b' })).toBeNull();
        expect(presignConfig({ PRESIGN_ACCESS_KEY: 'a', PRESIGN_SECRET_KEY: 'b', PRESIGN_BUCKET: 'c' })).toEqual({
            accessKey: 'a',
            secretKey: 'b',
            bucket: 'c',
            region: 'us-east-1',
            port: 9000,
        });
    });

    it('answers 501 on /s3/_presign when no signer is configured', async () => {
        const res = await send('GET', '/s3/_presign?length=10');
        expect(res.status).toBe(501);
    });

    it('signs for the host the request came in on, with CORS open for the WebView', async () => {
        await new Promise(resolve => server.close(resolve));
        ({ server } = createUploadTestServer({
            presign: { accessKey: 'AKID', secretKey: 'SECRET', bucket: 'b', region: 'us-east-1', port: 9000 },
        }));
        await new Promise(resolve => server.listen(0, resolve));
        port = server.address().port;

        const res = await new Promise((resolve, reject) => {
            http.get(
                {
                    host: '127.0.0.1',
                    port,
                    path: '/s3/_presign?length=5&contentType=text/plain&key=k',
                    headers: { host: '10.0.0.7:8080' },
                },
                response => {
                    let body = '';
                    response.on('data', chunk => (body += chunk));
                    response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
                }
            ).on('error', reject);
        });
        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBe('*');
        const { url, headers } = JSON.parse(res.body);
        expect(url.startsWith('http://10.0.0.7:9000/b/k?')).toBe(true);
        expect(headers).toEqual({ 'content-type': 'text/plain', 'content-length': '5' });

        expect((await send('GET', '/s3/_presign')).status).toBe(400);
    });
});
