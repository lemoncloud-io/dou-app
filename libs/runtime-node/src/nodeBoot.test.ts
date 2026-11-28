import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { config, createWebEnvAdapter } from '@chatic/config';
import type { HostPorts, TransportPort } from '@chatic/ports';

import {
    authNode,
    cacheMemory,
    defineRuntime,
    foregroundNode,
    headlessModules,
    hostNode,
    nodeHostFacts,
    startRuntime,
    storageFile,
    storageMemory,
    transportNode,
} from '.';
import type { NodeWebSocketConstructor } from '.';

const ENV: Record<string, string> = { VITE_ENV: 'dev' };

const declarationFor = (storage: ReturnType<typeof storageFile>, lines: string[]) =>
    defineRuntime({
        name: 'node-headless',
        facts: nodeHostFacts({ userAgent: 'dou-node-test/1' }),
        modules: headlessModules(),
        ports: {
            storage: { default: storage },
            transport: { default: transportNode() },
            auth: { default: authNode() },
            db: { default: cacheMemory },
            foreground: { default: foregroundNode },
        },
        host: hostNode({ writeLine: line => lines.push(line) }),
        config: { env: createWebEnvAdapter(name => ENV[name]) },
    });

describe('the headless preset boots in Node on the Node adapters', () => {
    let directory: string;

    beforeEach(() => {
        directory = mkdtempSync(join(tmpdir(), 'chatic-runtime-node-'));
    });

    afterEach(() => {
        rmSync(directory, { recursive: true, force: true });
    });

    it('starts session · http · sockets · sync with file storage, memory db and the Node host', async () => {
        const printed: string[] = [];
        const portLines: string[] = [];
        let published: HostPorts | undefined;

        const started = await startRuntime(declarationFor(storageFile(directory), printed), {
            log: line => portLines.push(line),
            publishHost: ports => {
                published = ports;
            },
        });

        expect(started.modules).toEqual(['session', 'http', 'sockets', 'sync']);
        expect(Object.keys(started.runtime).sort()).toEqual(
            ['connection', 'data', 'report', 'session', 'settings', 'sync'].sort()
        );
        expect(portLines).toEqual(
            expect.arrayContaining([
                'storage → storage.file (default)',
                'transport → transport.node (default)',
                'auth → auth.node (default)',
                'db → db.memory (default)',
                'foreground → foreground.node (default)',
                'links → links.node (default)',
            ])
        );
        expect(started.facts).toEqual({ platform: 'node', userAgent: 'dou-node-test/1' });
        expect(started.engine?.session.snapshot()).toBeDefined();
        expect(typeof started.engine?.connection.snapshot).toBe('function');
        expect(started.runtime.session.getGlobalSessionContext()).toBeDefined();

        published?.links.openUrl('https://example.com/pair');
        expect(printed).toEqual(['https://example.com/pair']);
        expect(published?.checkout.kind).toBe('none');

        expect(config.isInitialized()).toBe(true);
    });

    it('the storage port the engine got is the files in the directory', async () => {
        let storage: { device: { set(key: string, value: string): void } } | undefined;
        const watched = storageFile(directory);
        const spy: typeof watched = {
            ...watched,
            create: async context => {
                const created = await watched.create(context);
                storage = created;
                return created;
            },
        };

        await startRuntime(declarationFor(spy, []), { publishHost: () => undefined });
        storage?.device.set('probe', '1');

        expect(readdirSync(directory)).toContain('device.json');
    });

    it('opens sockets with the handshake user agent the relay checks', () => {
        const opened: unknown[] = [];
        const Socket = function (this: unknown, url: string, init: unknown) {
            opened.push({ url, init });
        } as unknown as NodeWebSocketConstructor;

        const transport = transportNode({ WebSocket: Socket }).create({
            facts: { platform: 'node', userAgent: 'dou-node-test/1' },
            storage: {} as never,
        }) as TransportPort;
        transport.createSocket({ url: 'wss://relay.example', protocols: ['p'] });

        expect(opened).toEqual([
            { url: 'wss://relay.example', init: { protocols: ['p'], headers: { 'User-Agent': 'dou-node-test/1' } } },
        ]);
        expect(transport.device()).toEqual({ appPlatform: 'node', userAgent: 'dou-node-test/1' });
        expect(transport.online.read()).toBe(true);
    });

    it('refuses to start without a WebSocket, naming the fix', async () => {
        const original = (globalThis as { WebSocket?: unknown }).WebSocket;
        delete (globalThis as { WebSocket?: unknown }).WebSocket;
        try {
            await expect(
                startRuntime(declarationFor(storageFile(directory), []), { publishHost: () => undefined })
            ).rejects.toThrow(/no global WebSocket — run Node 22 or later, or pass `WebSocket`/);
        } finally {
            (globalThis as { WebSocket?: unknown }).WebSocket = original;
        }
    });

    it('builds the Node host once for all eight host ports', async () => {
        const host = hostNode({ writeLine: () => undefined });
        const facts = { platform: 'node' as const, userAgent: 'x' };
        const links = host.links.default.create({ facts });
        const files = host.files.default.create({ facts });

        expect(host.links.default.id).toBe('links.node');
        expect(links).toBe(host.links.default.create({ facts }));
        expect(files.transfers).toBeNull();
    });

    it('a memory storage declaration boots too', async () => {
        const declaration = declarationFor(storageFile(directory), []);
        const started = await startRuntime(
            { ...declaration, ports: { ...declaration.ports, storage: { default: storageMemory } } },
            { publishHost: () => undefined }
        );

        expect(started.choices.storage.id).toBe('storage.memory');
    });
});
