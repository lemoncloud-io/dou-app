/// <reference types='vitest' />
import * as path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';

import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, searchForWorkspaceRoot, type ProxyOptions } from 'vite';

import { ENV_SWITCH_PATH, checkEnvRequest } from './src/server/envSwitch';
import { SHELL_BASE, WEB_PATHS, injectShellScript, isHtmlResponse, webUnreachablePage } from './src/server/proxyRules';

const ROOT = path.resolve(import.meta.dirname, '../..');

/**
 * What `yarn local` hands the shell server. The web's dev server is a separate process; this one
 * proxies it, so both pages share one origin (README § How it works).
 */
const PORT = Number(process.env['VIRTUAL_SHELL_PORT'] ?? 5007);
const WEB_ORIGIN = process.env['VIRTUAL_SHELL_WEB_ORIGIN'] ?? 'http://localhost:5003';
const ENV = process.env['VIRTUAL_SHELL_ENV'] === 'prod' ? 'prod' : 'dev';
// The Google client the mobile app signs in with. Read here only, never written to a log or the console.
const GOOGLE_CLIENT_ID = process.env['VIRTUAL_SHELL_GOOGLE_CLIENT_ID'] ?? '';

/**
 * The mobile app's own modules the shell calls, reached through aliases rather than imports. A
 * relative import breaks `@nx/enforce-module-boundaries`, and either form would make
 * `@chatic/mobile` a dependency of this project, whose typecheck would then build the mobile app
 * (red, and outside CI). The types are declared by hand in `src/shell/mobile.d.ts`; the unit tests
 * call these modules through the same aliases, so a change on the mobile side fails them.
 */
const MOBILE_ALIASES = {
    'virtual-shell/mobile-deeplink': path.join(ROOT, 'apps/mobile/src/app/services/deeplinks/deeplinkUtils.ts'),
    'virtual-shell/mobile-injection': path.join(ROOT, 'apps/mobile/src/app/webview/utils/injectionScripts.ts'),
    // `deeplinkUtils.ts` reads one value from react-native-config: `VITE_ENV`, for the custom scheme.
    'react-native-config': path.join(import.meta.dirname, 'src/stubs/reactNativeConfig.ts'),
};

/**
 * `deeplinkUtils.ts` takes its invite-link decoder from the `@chatic/shared` barrel, which also
 * carries React components, image assets and the web's config. Only that one importer is pointed at
 * the module the two functions live in — the same code, without the rest of the barrel.
 */
const sharedInviteLinkForDeeplinks = () => ({
    name: 'virtual-shell:shared-invite-link',
    enforce: 'pre' as const,
    resolveId(source: string, importer: string | undefined) {
        if (source !== '@chatic/shared' || !importer?.endsWith('/deeplinks/deeplinkUtils.ts')) return null;
        return path.join(ROOT, 'libs/shared/src/utils/inviteLink.ts');
    },
});

/**
 * `POST /__shell/api/env`: the shell page asking for the other backend's pair. Checked here
 * (`checkEnvRequest`), then handed to `yarn local`, which owns the processes, over the IPC channel it
 * opened; its answer goes back to the page. A server not started by `yarn local` has nobody to ask.
 */
const envSwitch = () => ({
    name: 'virtual-shell:env-switch',
    configureServer(server: {
        middlewares: { use: (handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void };
    }) {
        let nextId = 1;
        const pending = new Map<number, (answer: unknown) => void>();
        process.on('message', (message: { type?: string; id?: number }) => {
            if (message?.type !== 'switch-env-result' || typeof message.id !== 'number') return;
            pending.get(message.id)?.(message);
            pending.delete(message.id);
        });
        server.middlewares.use((req, res, next) => {
            if (req.url?.split('?')[0] !== ENV_SWITCH_PATH) return next();
            const chunks: Buffer[] = [];
            req.on('data', (chunk: Buffer) => chunks.push(chunk));
            req.on('end', () => {
                const reply = (status: number, body: unknown) => {
                    res.writeHead(status, { 'content-type': 'application/json' });
                    res.end(JSON.stringify(body));
                };
                const check = checkEnvRequest(
                    {
                        method: req.method,
                        headers: req.headers,
                        remoteAddress: req.socket.remoteAddress,
                        body: Buffer.concat(chunks).toString('utf8'),
                    },
                    PORT
                );
                if (!check.ok) return reply(check.status, { ok: false, reason: check.reason });
                if (!process.send) {
                    return reply(501, { ok: false, reason: 'this shell was not started by yarn local' });
                }
                const id = nextId++;
                pending.set(id, answer => {
                    // The IPC envelope (`type`, `id`) is between this server and `yarn local`, not the page's.
                    const { type: _type, id: _id, ...result } = answer as Record<string, unknown>;
                    reply(200, result);
                });
                process.send({ type: 'switch-env', env: check.env, id });
            });
        });
    },
});

/**
 * Proxies the web's dev server, HMR socket included, and rewrites every page it serves so the
 * injection script runs first (`injectShellScript`). The response is handled here rather than piped
 * (`selfHandleResponse`), so everything that is not HTML is copied through unchanged.
 */
const webProxy: ProxyOptions = {
    target: WEB_ORIGIN,
    ws: true,
    selfHandleResponse: true,
    configure: proxy => {
        proxy.on('proxyReq', proxyReq => {
            // An uncompressed body, so a page can be rewritten without decoding it first.
            proxyReq.removeHeader('accept-encoding');
        });
        proxy.on('proxyRes', (proxyRes: IncomingMessage, _req: IncomingMessage, res: ServerResponse) => {
            const html = isHtmlResponse(proxyRes.headers['content-type']);
            const headers = { ...proxyRes.headers };
            const status = proxyRes.statusCode ?? 502;
            if (!html) {
                res.writeHead(status, proxyRes.statusMessage, headers);
                proxyRes.pipe(res);
                return;
            }
            const chunks: Buffer[] = [];
            proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
            // A page cut off half way is not rewritten from what arrived: the request ends as failed.
            const fail = () => {
                if (!res.headersSent) res.writeHead(502);
                res.end();
            };
            proxyRes.on('error', fail);
            proxyRes.on('aborted', fail);
            proxyRes.on('end', () => {
                if (res.writableEnded) return;
                const body = injectShellScript(Buffer.concat(chunks).toString('utf8'));
                delete headers['content-length'];
                delete headers['content-encoding'];
                res.writeHead(status, proxyRes.statusMessage, headers);
                res.end(body);
            });
        });
        // Registered before Vite's own handler, which then finds the response sent and only logs. Its
        // empty 500 would leave the phone blank with no hint of why.
        proxy.on('error', (_error, req, res) => {
            if (!('writeHead' in res) || res.headersSent || res.writableEnded) return;
            const page = (req.headers.accept ?? '').includes('text/html');
            res.writeHead(502, { 'content-type': page ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8' });
            res.end(page ? webUnreachablePage(WEB_ORIGIN) : `The web dev server at ${WEB_ORIGIN} is not answering.`);
        });
    },
};

export default defineConfig({
    root: import.meta.dirname,
    base: SHELL_BASE,
    cacheDir: '../../node_modules/.vite/apps/virtual-shell',

    define: {
        __VIRTUAL_SHELL_CONFIG__: JSON.stringify({ env: ENV, googleClientId: GOOGLE_CLIENT_ID }),
        // `@chatic/logger` and friends, reached through `@chatic/bridges`, expect these.
        'process.env': {},
        global: 'window',
    },

    resolve: {
        alias: MOBILE_ALIASES,
    },

    server: {
        port: PORT,
        strictPort: true,
        // IPv4 loopback only: the page is opened as `localhost`, and nothing off this machine may reach
        // the switch endpoint that starts the prod pair.
        host: '127.0.0.1',
        fs: {
            allow: [searchForWorkspaceRoot(process.cwd())],
        },
        proxy: {
            [WEB_PATHS]: webProxy,
        },
    },

    plugins: [envSwitch(), sharedInviteLinkForDeeplinks(), react(), nxViteTsPaths()],

    build: {
        outDir: '../../dist/apps/virtual-shell',
        emptyOutDir: true,
    },

    test: {
        globals: true,
        environment: 'jsdom',
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
        reporters: ['default'],
    },
});
