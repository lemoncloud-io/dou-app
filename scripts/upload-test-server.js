/**
 * A local stand-in for the storage hop of a presigned upload or download.
 *
 * The native file-transfer module does one thing: move a whole file to or from a signed URL and
 * report what happened. Every case it must handle is a property of the storage response, not of our
 * API, so a server that answers like S3 — success, an expired signature, an existing key, a slow
 * link, a dropped connection — exercises the module end to end without the upload API existing yet.
 *
 * The scenario is chosen by the method and the URL path, so a test only swaps the URL it hands to
 * the app:
 *
 *   PUT /s3/ok                read the whole body, answer 200
 *   PUT /s3/expired           answer 403 with an S3 `AccessDenied` error body
 *   PUT /s3/exists            answer 412 with an S3 `PreconditionFailed` error body
 *   PUT /s3/slow?bps=N        read at N bytes per second, then 200
 *   PUT /s3/drop?after=N      destroy the connection after N bytes
 *
 *   GET /s3/image?format=F    200 with a real image and its Content-Length; F is png (default),
 *                             jpeg, gif (two frames, animated) or webp. `px=N` sizes the png
 *                             (N×N noise, default 64) so a download's progress has room to show
 *   GET /s3/image-chunked?format=F
 *                             the same image chunked, with no Content-Length (format default jpeg)
 *   GET /s3/expired           403 with an S3 `AccessDenied` error body — no file may be kept
 *   GET /s3/slow?bps=N        a noise png (`px`, default 256) sent at N bytes per second, for cancel
 *   GET /s3/drop?after=N      declares the whole png, sends N bytes, then drops the connection
 *   GET /s3/html              200 with an HTML page — kept as a file, refused by save and share
 *
 *   GET /s3/_log              what the server received (headers, body length) as JSON
 *   DELETE /s3/_log           clear that record
 *   GET /s3/_presign?length=N&contentType=T[&key=K][&expires=S]
 *                             a real SigV4 presigned PUT for an S3-compatible store, as
 *                             `{ url, headers }` — only when the PRESIGN_* variables are set
 *
 * The scenario paths do not check signatures. Whether a real presigned URL still validates after
 * the module filters its headers needs a real signer, which `_presign` provides against a local
 * MinIO (or any S3-compatible endpoint). The URL signs `content-length`, `content-type` and `host`,
 * the way the upload API's presigned PUT does, so a shell that sets any of them differently gets
 * 403 `SignatureDoesNotMatch` from the store.
 *
 * Usage:
 *   node scripts/upload-test-server.js              # port 8080
 *   PORT=9000 node scripts/upload-test-server.js
 *
 *   # with a signer: MinIO on port 9000 and a bucket that exists
 *   PRESIGN_ACCESS_KEY=… PRESIGN_SECRET_KEY=… PRESIGN_BUCKET=transfer-test \
 *     node scripts/upload-test-server.js
 *
 * The signed URL points at the host the app used to reach this server, on `PRESIGN_PORT` (9000),
 * so it is `localhost` on a simulator or an emulator (`adb reverse tcp:9000 tcp:9000` as well) and
 * the machine's LAN address on a device. `PRESIGN_REGION` defaults to `us-east-1`.
 *
 * Android emulator: `adb reverse tcp:8080 tcp:8080`, then use http://localhost:8080 — the same
 * route the local run uses for the web bundle. iOS simulator reaches localhost directly.
 */
const crypto = require('crypto');
const http = require('http');
const zlib = require('zlib');

const DEFAULT_PORT = 8080;

const s3Error = (code, message) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<Error><Code>${code}</Code><Message>${message}</Message></Error>`;

// ---- Images ----------------------------------------------------------------------------------
//
// Real, decodable files: a saved copy has to open in the photo library, and a GIF has to show
// whether its animation survived. PNG and GIF are built here; the small JPEG and WebP are embedded
// (a 48×48 blue square on grey — `sips`/`cwebp -lossless` output).

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

const crc32 = bytes => {
    let c = 0xffffffff;
    for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
};

/** An N×N RGB PNG of random noise. Noise does not compress, so the file grows with N. */
const noisePng = px => {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(px, 0);
    header.writeUInt32BE(px, 4);
    header[8] = 8; // bit depth
    header[9] = 2; // RGB
    const rows = [];
    for (let y = 0; y < px; y++) rows.push(Buffer.from([0]), crypto.randomBytes(px * 3));
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk('IHDR', header),
        pngChunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
};

/**
 * A 32×32 GIF that alternates between two colours every half second, looping. The pixel data uses
 * the "uncompressed" LZW trick — a clear code before every two literals keeps codes at 3 bits — so
 * no encoder is needed.
 */
const blinkingGif = () => {
    const size = 32;
    const le16 = n => [n & 0xff, n >> 8];
    const frame = colour => {
        const codes = [];
        for (let i = 0; i < size * size; i += 2) codes.push(4, colour, colour);
        codes.push(5);
        const bytes = [];
        let acc = 0;
        let bits = 0;
        for (const code of codes) {
            acc |= code << bits;
            bits += 3;
            while (bits >= 8) {
                bytes.push(acc & 0xff);
                acc >>= 8;
                bits -= 8;
            }
        }
        if (bits > 0) bytes.push(acc & 0xff);
        const blocks = [];
        for (let i = 0; i < bytes.length; i += 255) {
            const block = bytes.slice(i, i + 255);
            blocks.push(block.length, ...block);
        }
        return [
            ...[0x21, 0xf9, 0x04, 0x04, ...le16(50), 0x00, 0x00], // graphic control: 0.5 s
            ...[0x2c, ...le16(0), ...le16(0), ...le16(size), ...le16(size), 0x00],
            0x02, // LZW minimum code size
            ...blocks,
            0x00,
        ];
    };
    return Buffer.from([
        ...Buffer.from('GIF89a', 'ascii'),
        ...le16(size),
        ...le16(size),
        0x91, // global colour table of four entries
        0x00,
        0x00,
        ...[0xf0, 0xf0, 0xf0, 0xf5, 0x8a, 0x1e, 0x34, 0x78, 0xf6, 0x00, 0x00, 0x00],
        ...[0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0', 'ascii'), 0x03, 0x01, 0x00, 0x00, 0x00],
        ...frame(1),
        ...frame(2),
        0x3b,
    ]);
};

const JPEG = Buffer.from(
    [
        '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwg',
        'IyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgo',
        'KCgoKCgoKCgoKCgoKCj/wAARCAAwADADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAA',
        'AgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6',
        'Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG',
        'x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREA',
        'AgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5',
        'OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPE',
        'xcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6Voor5Xr1csyz6/ze9y8tul97+a7HFi8X',
        '9Wtpe59UUV8r0V6v+rP/AE9/8l/4Jx/2v/c/H/gH1RRXyvX1RXlZnln1Dl97m5r9LbW833OzCYv6zfS1gr5Xr6or5Xr1eGf+',
        'Xv8A27+px5v9j5/oFFFFfVnjBX1RXyvX1RXynE3/AC6/7e/Q9nKPt/L9Qr5Xr6oorysszP6hze7zc1uttr+T7nZi8J9Ztrax',
        '8r0V9UUV6v8ArN/06/8AJv8AgHH/AGR/f/D/AIJ8r19UUUV5WZ5n9f5fd5eW/W+9vJdjswmE+rX1vc//2Q==',
    ].join(''),
    'base64'
);

const WEBP = Buffer.from('UklGRjAAAABXRUJQVlA4TCQAAAAvL8ALAA9wRPgTwd8Afv7jAUrbNmD6/9PhXTii/xMgf4Dv7AE=', 'base64');

const IMAGE_TYPES = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

/** The requested image and its type; `px` sizes the png. */
const imageOf = (format, px) => {
    switch (format) {
        case 'jpeg':
            return { body: JPEG, type: IMAGE_TYPES.jpeg };
        case 'gif':
            return { body: blinkingGif(), type: IMAGE_TYPES.gif };
        case 'webp':
            return { body: WEBP, type: IMAGE_TYPES.webp };
        default:
            return { body: noisePng(px), type: IMAGE_TYPES.png };
    }
};

/** A non-negative integer query value, or the fallback when absent or malformed. */
const intParam = (url, name, fallback) => {
    const raw = url.searchParams.get(name);
    if (raw === null) return fallback;
    const value = Number(raw);
    return Number.isInteger(value) && value >= 0 ? value : fallback;
};

const sha256Hex = value => crypto.createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => crypto.createHmac('sha256', key).update(value).digest();

/** RFC 3986 encoding, which SigV4 requires; `encodeURIComponent` leaves `!'()*` alone. */
const rfc3986 = value =>
    encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * A SigV4 query-string presigned PUT (the form S3 and MinIO accept). `content-length`,
 * `content-type` and `host` are signed headers, so the request has to carry exactly these values.
 * `now` is injectable for tests.
 */
const presignPut = ({
    endpoint,
    bucket,
    key,
    region,
    accessKey,
    secretKey,
    contentType,
    contentLength,
    expires,
    now,
}) => {
    const target = new URL(endpoint);
    const amzDate = now
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');
    const day = amzDate.slice(0, 8);
    const scope = `${day}/${region}/s3/aws4_request`;
    const path = `/${bucket}/${key.split('/').map(rfc3986).join('/')}`;
    const signedHeaders = 'content-length;content-type;host';
    const query = [
        ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
        ['X-Amz-Credential', `${accessKey}/${scope}`],
        ['X-Amz-Date', amzDate],
        ['X-Amz-Expires', String(expires)],
        ['X-Amz-SignedHeaders', signedHeaders],
    ]
        .map(([name, value]) => `${rfc3986(name)}=${rfc3986(value)}`)
        .sort()
        .join('&');
    const canonicalRequest = [
        'PUT',
        path,
        query,
        `content-length:${contentLength}\ncontent-type:${contentType}\nhost:${target.host}\n`,
        signedHeaders,
        'UNSIGNED-PAYLOAD',
    ].join('\n');
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
    const signingKey = ['s3', 'aws4_request'].reduce(
        (k, part) => hmac(k, part),
        hmac(hmac(`AWS4${secretKey}`, day), region)
    );
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    return {
        url: `${target.protocol}//${target.host}${path}?${query}&X-Amz-Signature=${signature}`,
        headers: { 'content-type': contentType, 'content-length': String(contentLength) },
    };
};

/** The signer settings from the environment, or null when `_presign` is not configured. */
const presignConfig = env =>
    env.PRESIGN_ACCESS_KEY && env.PRESIGN_SECRET_KEY && env.PRESIGN_BUCKET
        ? {
              accessKey: env.PRESIGN_ACCESS_KEY,
              secretKey: env.PRESIGN_SECRET_KEY,
              bucket: env.PRESIGN_BUCKET,
              region: env.PRESIGN_REGION || 'us-east-1',
              port: Number(env.PRESIGN_PORT) || 9000,
          }
        : null;

/**
 * Builds the server. `log` is the in-memory record `GET /s3/_log` serves; it is returned so a test
 * can read it without going over HTTP.
 */
const createUploadTestServer = ({ presign = null } = {}) => {
    const log = [];

    const record = (req, url, receivedBytes, outcome) => {
        log.push({
            method: req.method,
            path: url.pathname,
            query: Object.fromEntries(url.searchParams),
            headers: req.headers,
            declaredLength: req.headers['content-length'] === undefined ? null : Number(req.headers['content-length']),
            receivedBytes,
            outcome,
        });
    };

    /** Counts the body as it arrives and calls `done` once it has all been read. */
    const drain = (req, done) => {
        let received = 0;
        req.on('data', chunk => {
            received += chunk.length;
        });
        req.on('end', () => done(received));
    };

    const finish = (res, status, body, contentType = 'application/xml') => {
        res.writeHead(status, body ? { 'Content-Type': contentType } : {});
        res.end(body);
    };

    const handlePut = (req, res, url) => {
        switch (url.pathname) {
            case '/s3/ok':
                return drain(req, received => {
                    record(req, url, received, 200);
                    finish(res, 200);
                });

            case '/s3/expired':
                return drain(req, received => {
                    record(req, url, received, 403);
                    finish(res, 403, s3Error('AccessDenied', 'Request has expired'));
                });

            case '/s3/exists':
                return drain(req, received => {
                    record(req, url, received, 412);
                    finish(
                        res,
                        412,
                        s3Error('PreconditionFailed', 'At least one of the pre-conditions you specified did not hold')
                    );
                });

            case '/s3/slow': {
                // Pausing the socket between chunks makes the client's own send buffer fill up, so its
                // progress callbacks slow down the way they would on a bad link.
                const bps = Math.max(1, intParam(url, 'bps', 64 * 1024));
                let received = 0;
                req.on('data', chunk => {
                    received += chunk.length;
                    req.pause();
                    setTimeout(() => req.resume(), Math.ceil((chunk.length / bps) * 1000));
                });
                req.on('end', () => {
                    record(req, url, received, 200);
                    finish(res, 200);
                });
                return undefined;
            }

            case '/s3/drop': {
                const after = intParam(url, 'after', 0);
                let received = 0;
                let dropped = false;
                const drop = () => {
                    if (dropped) return;
                    dropped = true;
                    record(req, url, received, 'dropped');
                    req.socket.destroy();
                };
                req.on('data', chunk => {
                    received += chunk.length;
                    if (received >= after) drop();
                });
                // A body shorter than `after` still has to end in a drop, not a response.
                req.on('end', drop);
                if (after === 0) drop();
                return undefined;
            }

            default:
                return drain(req, received => {
                    record(req, url, received, 404);
                    finish(res, 404, s3Error('NoSuchKey', 'Unknown scenario path'));
                });
        }
    };

    /** Downloads: the body is generated, so only the request headers are recorded. */
    const handleGet = (req, res, url) => {
        const format = url.searchParams.get('format');
        switch (url.pathname) {
            case '/s3/image': {
                const { body, type } = imageOf(format || 'png', Math.max(1, intParam(url, 'px', 64)));
                record(req, url, 0, 200);
                res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length });
                return res.end(body);
            }

            case '/s3/image-chunked': {
                const { body, type } = imageOf(format || 'jpeg', Math.max(1, intParam(url, 'px', 64)));
                record(req, url, 0, 200);
                // Two writes and no Content-Length: Node sends it chunked, so the client cannot know
                // the total until the body ends.
                res.writeHead(200, { 'Content-Type': type });
                const half = Math.floor(body.length / 2);
                res.write(body.subarray(0, half));
                return setTimeout(() => res.end(body.subarray(half)), 50);
            }

            case '/s3/expired':
                record(req, url, 0, 403);
                return finish(res, 403, s3Error('AccessDenied', 'Request has expired'));

            case '/s3/slow': {
                const bps = Math.max(1, intParam(url, 'bps', 64 * 1024));
                const body = noisePng(Math.max(1, intParam(url, 'px', 256)));
                record(req, url, 0, 200);
                res.writeHead(200, { 'Content-Type': IMAGE_TYPES.png, 'Content-Length': body.length });
                // A tenth of a second's worth per write: with a declared length the client finishes
                // on the last byte, so the pacing has to hold every chunk back, not just the end.
                const chunk = Math.max(1, Math.ceil(bps / 10));
                let sent = 0;
                const tick = () => {
                    if (res.destroyed) return undefined;
                    if (sent >= body.length) return res.end();
                    const next = body.subarray(sent, sent + chunk);
                    sent += next.length;
                    res.write(next);
                    return setTimeout(tick, Math.ceil((next.length / bps) * 1000));
                };
                return tick();
            }

            case '/s3/drop': {
                const body = noisePng(Math.max(1, intParam(url, 'px', 256)));
                const after = Math.min(intParam(url, 'after', Math.floor(body.length / 2)), body.length - 1);
                record(req, url, 0, 'dropped');
                res.writeHead(200, { 'Content-Type': IMAGE_TYPES.png, 'Content-Length': body.length });
                res.write(body.subarray(0, after));
                return setTimeout(() => req.socket.destroy(), 50);
            }

            case '/s3/html':
                record(req, url, 0, 200);
                return finish(res, 200, '<!doctype html><html><body>not an image</body></html>', 'text/html');

            default:
                record(req, url, 0, 404);
                return finish(res, 404, s3Error('NoSuchKey', 'Unknown scenario path'));
        }
    };

    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');

        if (url.pathname === '/s3/_log') {
            if (req.method === 'GET') return finish(res, 200, JSON.stringify(log, null, 2), 'application/json');
            if (req.method === 'DELETE') {
                log.length = 0;
                return finish(res, 204);
            }
        }

        if (url.pathname === '/s3/_presign' && req.method === 'GET') {
            if (!presign) {
                return finish(
                    res,
                    501,
                    JSON.stringify({ error: 'set PRESIGN_ACCESS_KEY, PRESIGN_SECRET_KEY and PRESIGN_BUCKET' }),
                    'application/json'
                );
            }
            const contentLength = intParam(url, 'length', -1);
            const contentType = url.searchParams.get('contentType') || 'application/octet-stream';
            if (contentLength < 0) {
                return finish(res, 400, JSON.stringify({ error: 'length is required' }), 'application/json');
            }
            // The host the app used to reach this server is the one that reaches the store.
            const hostname = (req.headers.host || 'localhost').replace(/:\d+$/, '');
            const signed = presignPut({
                ...presign,
                endpoint: `http://${hostname}:${presign.port}`,
                key: url.searchParams.get('key') || `transfer-${Date.now()}.bin`,
                contentType,
                contentLength,
                expires: Math.max(1, intParam(url, 'expires', 900)),
                now: new Date(),
            });
            // The debug screen asks from the WebView's origin, not this one.
            res.setHeader('Access-Control-Allow-Origin', '*');
            return finish(res, 200, JSON.stringify(signed), 'application/json');
        }

        if (req.method === 'PUT') return handlePut(req, res, url);
        if (req.method === 'GET') return handleGet(req, res, url);

        return finish(res, 405, s3Error('MethodNotAllowed', 'Only PUT and GET are accepted on scenario paths'));
    });

    return { server, log };
};

module.exports = { createUploadTestServer, s3Error, presignPut, presignConfig, noisePng, blinkingGif };

if (require.main === module) {
    const port = Number(process.env.PORT) || DEFAULT_PORT;
    const presign = presignConfig(process.env);
    const { server } = createUploadTestServer({ presign });
    server.listen(port, () => {
        console.log(`Upload test server (S3 stand-in) on http://localhost:${port}`);
        console.log('  PUT /s3/ok | /s3/expired | /s3/exists | /s3/slow?bps=N | /s3/drop?after=N');
        console.log(
            '  GET /s3/image?format=png|jpeg|gif|webp | /s3/image-chunked | /s3/expired | /s3/slow | /s3/drop | /s3/html'
        );
        console.log('  GET /s3/_log · DELETE /s3/_log');
        console.log(
            presign
                ? `  GET /s3/_presign → bucket "${presign.bucket}" on port ${presign.port}`
                : '  GET /s3/_presign is off (PRESIGN_* not set)'
        );
    });
}
