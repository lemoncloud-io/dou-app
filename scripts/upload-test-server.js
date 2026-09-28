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
 *
 * It does not check signatures. Whether a real presigned URL still validates after the module
 * filters its headers needs a real signer (MinIO or a dev bucket), once.
 *
 * Usage:
 *   node scripts/upload-test-server.js              # port 8080
 *   PORT=9000 node scripts/upload-test-server.js
 *
 * Android emulator: `adb reverse tcp:8080 tcp:8080`, then use http://localhost:8080 — the same
 * route the local run uses for the web bundle. iOS simulator reaches localhost directly.
 */
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

/**
 * Builds the server. `log` is the in-memory record `GET /s3/_log` serves; it is returned so a test
 * can read it without going over HTTP.
 */
const createUploadTestServer = () => {
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

        if (req.method === 'PUT') return handlePut(req, res, url);

        return finish(res, 405, s3Error('MethodNotAllowed', 'Only PUT is accepted on scenario paths'));
    });

    return { server, log };
};

module.exports = { createUploadTestServer, s3Error };

if (require.main === module) {
    const port = Number(process.env.PORT) || DEFAULT_PORT;
    const { server } = createUploadTestServer();
    server.listen(port, () => {
        console.log(`Upload test server (S3 stand-in) on http://localhost:${port}`);
        console.log('  PUT /s3/ok | /s3/expired | /s3/exists | /s3/slow?bps=N | /s3/drop?after=N');
        console.log('  GET /s3/_log · DELETE /s3/_log');
    });
}
