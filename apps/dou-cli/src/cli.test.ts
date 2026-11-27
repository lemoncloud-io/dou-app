import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { initAppRuntime, resetRuntimeEngine } from '@chatic/runtime/api';
import type { RuntimeEngine } from '@chatic/runtime/engine';

import { bootNode } from './boot';
import type { Boot } from './boot';
import { runCli } from './cli';

const pairNode = jest.fn();
jest.mock('@chatic/host-node', () => ({
    ...jest.requireActual('@chatic/host-node'),
    pairNode: (o: unknown) => pairNode(o),
}));

const snapshot = {
    auth: { isAuthenticated: true },
    context: {
        activeServer: { kind: 'cloud', cloudId: 'cloud-9', siteId: 's1', backend: 'b', wss: 'w' },
        identity: { userId: 'u1', delegatorId: 'd1' },
    },
    pairing: { cloudIds: ['cloud-9', 'cloud-2'], cloudNames: { 'cloud-9': 'Nine' } },
};

const harness = () => {
    const out: string[] = [];
    const err: string[] = [];
    const stop = jest.fn(async () => undefined);
    const boot: Boot = jest.fn(async () => ({ stop }));
    return { out, err, stop, boot, io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) } };
};

describe('dou-cli commands', () => {
    beforeEach(() => {
        initAppRuntime({ session: { snapshot: () => snapshot } } as unknown as RuntimeEngine);
    });
    afterEach(() => {
        resetRuntimeEngine();
        pairNode.mockReset();
    });

    it('whoami prints the account and active server as JSON', async () => {
        const h = harness();
        await expect(runCli(['whoami'], h)).resolves.toBe(0);
        expect(JSON.parse(h.out[0])).toEqual({
            signedIn: true,
            userId: 'u1',
            delegatorId: 'd1',
            activeServer: { kind: 'cloud', cloudId: 'cloud-9', siteId: 's1' },
        });
        expect(h.stop).toHaveBeenCalledTimes(1);
    });

    it('clouds prints the entered clouds with their names', async () => {
        const h = harness();
        await expect(runCli(['clouds'], h)).resolves.toBe(0);
        expect(JSON.parse(h.out[0])).toEqual({
            active: 'cloud-9',
            clouds: [
                { cloudId: 'cloud-9', name: 'Nine' },
                { cloudId: 'cloud-2', name: null },
            ],
        });
    });

    it('asks for sockets only when it serves', async () => {
        const served = harness();
        const stopServing = new AbortController();
        stopServing.abort();
        await runCli(['serve'], { ...served, signal: stopServing.signal });
        expect(served.boot).toHaveBeenCalledWith(expect.objectContaining({ sockets: true }));
        for (const command of ['whoami', 'clouds']) {
            const h = harness();
            await runCli([command], h);
            expect(h.boot).toHaveBeenCalledWith(expect.objectContaining({ sockets: false }));
        }
    });

    it('boots with the profile given', async () => {
        const h = harness();
        await runCli(['--profile', '/tmp/dou-x', 'whoami'], h);
        expect(h.boot).toHaveBeenCalledWith(expect.objectContaining({ profile: '/tmp/dou-x' }));
    });

    it('pair exits 0 when the pairing is done and 1 otherwise', async () => {
        const h = harness();
        pairNode.mockResolvedValueOnce({ phase: 'done', target: { type: 'relay' } });
        await expect(runCli(['pair'], h)).resolves.toBe(0);
        pairNode.mockResolvedValueOnce({ phase: 'denied' });
        await expect(runCli(['pair'], h)).resolves.toBe(1);
        expect(h.err).toEqual(['pairing denied']);
    });

    it('pair exits 130 when the stop signal ends the wait', async () => {
        const h = harness();
        const controller = new AbortController();
        pairNode.mockImplementationOnce(() => {
            controller.abort();
            return Promise.reject(new Error('pairing aborted'));
        });
        await expect(runCli(['pair'], { ...h, signal: controller.signal })).resolves.toBe(130);
        expect(h.err).toEqual(['pairing aborted']);
    });

    it('--env-file hands the file values to the boot over the process environment', async () => {
        const h = harness();
        const directory = mkdtempSync(join(tmpdir(), 'dou-cli-env-'));
        const path = join(directory, '.env');
        writeFileSync(path, 'VITE_ENV=staging\nVITE_OAUTH_ENDPOINT=https://oauth.example.com\n');
        try {
            await runCli(['--env-file', path, 'whoami'], h);
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
        expect(h.boot).toHaveBeenCalledWith(
            expect.objectContaining({
                env: expect.objectContaining({ VITE_ENV: 'staging', VITE_OAUTH_ENDPOINT: 'https://oauth.example.com' }),
            })
        );
    });

    it('accepts --parent-pipe in front of a command', async () => {
        const h = harness();
        await expect(runCli(['--parent-pipe', 'whoami'], h)).resolves.toBe(0);
    });

    it('an unknown command prints usage and exits 2', async () => {
        const h = harness();
        await expect(runCli(['nope'], h)).resolves.toBe(2);
        expect(h.boot).not.toHaveBeenCalled();
        expect(h.err[0]).toContain('usage: dou-cli');
    });

    it('serve calls onReady once after boot and exits 0 on the stop signal', async () => {
        const h = harness();
        const controller = new AbortController();
        const onReady = jest.fn();
        const done = runCli(['serve'], { ...h, signal: controller.signal, hooks: { onReady } });
        await new Promise(resolve => setImmediate(resolve));
        expect(onReady).toHaveBeenCalledTimes(1);
        expect(h.stop).not.toHaveBeenCalled();
        controller.abort();
        await expect(done).resolves.toBe(0);
        expect(h.stop).toHaveBeenCalledTimes(1);
    });

    it('serve stops what onReady returned before it stops the runtime, and stops the runtime when onReady fails', async () => {
        const order: string[] = [];
        const h = harness();
        h.stop.mockImplementation(async () => void order.push('runtime'));
        const controller = new AbortController();
        const done = runCli(['serve'], {
            ...h,
            signal: controller.signal,
            hooks: { onReady: async () => async () => void order.push('hook') },
        });
        await new Promise(resolve => setImmediate(resolve));
        controller.abort();
        await expect(done).resolves.toBe(0);
        expect(order).toEqual(['hook', 'runtime']);

        const failing = harness();
        await expect(
            runCli(['serve'], {
                ...failing,
                hooks: {
                    onReady: async () => {
                        throw new Error('already serving');
                    },
                },
            })
        ).rejects.toThrow('already serving');
        expect(failing.stop).toHaveBeenCalledTimes(1);
    });
});

describe('bootNode', () => {
    let directory: string;
    beforeEach(() => {
        directory = mkdtempSync(join(tmpdir(), 'dou-cli-'));
    });
    afterEach(() => {
        resetRuntimeEngine();
        rmSync(directory, { recursive: true, force: true });
    });

    it('keeps the Node session files inside <profile>/node and starts signed out', async () => {
        const booted = await bootNode({ profile: directory, writeLine: () => undefined, env: {} });
        const out: string[] = [];
        await runCli(['whoami'], {
            boot: async () => booted,
            io: { out: (l: string) => out.push(l), err: () => undefined },
        });
        expect(JSON.parse(out[0]).signedIn).toBe(false);
        expect(readdirSync(directory)).toEqual(['node']);
    });
});
