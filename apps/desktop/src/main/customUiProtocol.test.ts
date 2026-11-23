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
        const response = await handle(request('/settings', NAVIGATION));
        expect(response.status).toBe(200);
        await expect(response.text()).resolves.toContain('index.html');
    });

    it('falls back for a route whose last segment has dots', async () => {
        const response = await handle(request('/join/invt.1.abc', NAVIGATION));
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
