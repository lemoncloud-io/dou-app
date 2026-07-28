/**
 * The request handler, with electron mocked away.
 *
 * The handler decides what a request that matched no file gets back, and the two answers it
 * can give are not interchangeable: a client route needs the entry point, an absent asset
 * needs a 404. Getting that split wrong is silent in both directions — a deep link renders
 * "Not found" with no error anywhere, or a missing script arrives as HTML and fails as a
 * syntax error somewhere unrelated. So the split is pinned here rather than left to a smoke
 * test that only ever loads `/`.
 *
 * `net.fetch` is mocked onto the real filesystem so absence is real absence; `protocol` is
 * mocked because registering one needs a live app.
 */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

jest.mock('electron', () => ({
    protocol: { handle: jest.fn(), unhandle: jest.fn() },
    net: { fetch: jest.fn() },
}));

import { net, protocol } from 'electron';

import { registerCustomUiProtocol } from './customUiProtocol';
import { CUSTOM_UI_ORIGIN } from './webUrl';

const root = mkdtempSync(join(tmpdir(), 'custom-ui-protocol-'));
mkdirSync(join(root, 'assets'));
writeFileSync(join(root, 'index.html'), '<!doctype html>entry');
writeFileSync(join(root, 'assets', 'app.js'), 'console.log(1)');

/**
 * Only `url` and the Accept header are read, and a real `Request` cannot be built here —
 * Node's implementation rejects a non-http scheme, which is precisely the scheme under test.
 */
const request = (path: string, accept: string | null): Request =>
    ({
        url: `${CUSTOM_UI_ORIGIN}${path}`,
        headers: { get: (name: string) => (name.toLowerCase() === 'accept' ? accept : null) },
    }) as unknown as Request;

const NAVIGATION = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const SUBRESOURCE = '*/*';

type Handler = (request: Request) => Promise<Response>;

const handlerFor = (dir: string): Handler => {
    (protocol.handle as jest.Mock).mockClear();
    registerCustomUiProtocol(dir);
    return (protocol.handle as jest.Mock).mock.calls[0][1] as Handler;
};

let handle: Handler;

beforeEach(() => {
    // Reset, not just re-stub: two tests assert the handler never reached the filesystem,
    // and a retained call log from an earlier test would make those pass or fail by order.
    (net.fetch as jest.Mock).mockReset();
    (net.fetch as jest.Mock).mockImplementation(async (url: string) => {
        const path = fileURLToPath(url);
        if (!existsSync(path)) throw new Error(`ENOENT: ${path}`);
        return new Response(`served:${path}`, { status: 200 });
    });
    handle = handlerFor(root);
});

describe('serving what is there', () => {
    it('serves a file that exists', async () => {
        const response = await handle(request('/assets/app.js', SUBRESOURCE));
        expect(response.status).toBe(200);
        await expect(response.text()).resolves.toContain(join('assets', 'app.js'));
    });

    it('serves the entry point at the root path', async () => {
        const response = await handle(request('/', NAVIGATION));
        expect(response.status).toBe(200);
        await expect(response.text()).resolves.toContain('index.html');
    });
});

describe('serving what is not there', () => {
    it('falls back to the entry point for a client route', async () => {
        // BrowserRouter owns /settings; reloading there must reach the router, not a 404.
        const response = await handle(request('/settings', NAVIGATION));
        expect(response.status).toBe(200);
        await expect(response.text()).resolves.toContain('index.html');
    });

    it('falls back for a route whose last segment has dots', async () => {
        // /auth/token/<jwt> — the reason the fallback keys on Accept and not on an extension.
        const response = await handle(request('/auth/token/eyJhbG.eyJzdWI.sig', NAVIGATION));
        expect(response.status).toBe(200);
        await expect(response.text()).resolves.toContain('index.html');
    });

    it('404s a missing asset instead of answering it with HTML', async () => {
        const response = await handle(request('/assets/gone-abc123.js', SUBRESOURCE));
        expect(response.status).toBe(404);
    });

    it('404s a missing asset even when Accept is absent', async () => {
        const response = await handle(request('/assets/gone-abc123.js', null));
        expect(response.status).toBe(404);
    });

    it('404s when the entry point itself is missing', async () => {
        const empty = mkdtempSync(join(tmpdir(), 'custom-ui-protocol-empty-'));
        const response = await handlerFor(empty)(request('/settings', NAVIGATION));
        expect(response.status).toBe(404);
    });
});

describe('what the fallback must not reach', () => {
    it('404s a traversal attempt rather than falling back', async () => {
        // A traversal answered with 200 tells the caller the shape is worth refining.
        const response = await handle(request('/..%2fescape/index.html', NAVIGATION));
        expect(response.status).toBe(404);
        expect(net.fetch).not.toHaveBeenCalled();
    });

    it('404s another host on the same scheme', async () => {
        const response = await handle({
            url: 'chatic-local://elsewhere/settings',
            headers: { get: () => NAVIGATION },
        } as unknown as Request);
        expect(response.status).toBe(404);
        expect(net.fetch).not.toHaveBeenCalled();
    });
});
