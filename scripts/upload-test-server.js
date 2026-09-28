/**
 * A local stand-in for the storage hop of a presigned upload.
 *
 * The native file-transfer module does one thing: PUT a whole file to a signed URL and report what
 * happened. Every case it must handle is a property of the storage response, not of our API, so a
 * server that answers like S3 — success, an expired signature, an existing key, a slow link, a
 * dropped connection — exercises the module end to end without the upload API existing yet.
 *
 * The scenario is chosen by the URL path, so a test only swaps the URL it hands to the app:
 *
 *   PUT /s3/ok                read the whole body, answer 200
 *   PUT /s3/expired           answer 403 with an S3 `AccessDenied` error body
 *   PUT /s3/exists            answer 412 with an S3 `PreconditionFailed` error body
 *   PUT /s3/slow?bps=N        read at N bytes per second, then 200
 *   PUT /s3/drop?after=N      destroy the connection after N bytes
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

const DEFAULT_PORT = 8080;

const s3Error = (code, message) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<Error><Code>${code}</Code><Message>${message}</Message></Error>`;

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

        return finish(res, 405, s3Error('MethodNotAllowed', 'Only PUT is accepted on scenario paths'));
    });

    return { server, log };
};

module.exports = { createUploadTestServer, s3Error, presignPut, presignConfig };

if (require.main === module) {
    const port = Number(process.env.PORT) || DEFAULT_PORT;
    const presign = presignConfig(process.env);
    const { server } = createUploadTestServer({ presign });
    server.listen(port, () => {
        console.log(`Upload test server (S3 stand-in) on http://localhost:${port}`);
        console.log('  PUT /s3/ok | /s3/expired | /s3/exists | /s3/slow?bps=N | /s3/drop?after=N');
        console.log('  GET /s3/_log · DELETE /s3/_log');
        console.log(
            presign
                ? `  GET /s3/_presign → bucket "${presign.bucket}" on port ${presign.port}`
                : '  GET /s3/_presign is off (PRESIGN_* not set)'
        );
    });
}
