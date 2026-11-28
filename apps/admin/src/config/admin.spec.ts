import { describe, expect, it, vi } from 'vitest';

import { startRuntime } from '@chatic/runtime-web';
import type { StartRuntimeOptions } from '@chatic/runtime-web';

import { webConfigPorts } from './adapters/config';
import { deviceStore, tabStore } from '../app/storage';
import { admin } from './admin';

const EXPECTED_DEFAULTS = {
    storage: 'storage.admin-tab',
    transport: 'transport.browser',
    auth: 'auth.location',
    db: 'db.admin-web-storage',
    foreground: 'foreground.visibility',
} as const;

type Read = NonNullable<StartRuntimeOptions['read']>;

const start = async (read: Read = () => undefined) => {
    const config = { init: vi.fn(), isInitialized: vi.fn(() => false), snapshot: vi.fn(() => undefined) };
    const createRuntime = vi.fn((_ports: unknown) => ({}) as never);
    const initEngine = vi.fn();
    const log = vi.fn();
    const started = await startRuntime(admin, { config, read, createRuntime, initEngine, log });
    return { started, config, createRuntime, initEngine, log };
};

describe('admin runtime declaration', () => {
    it('declares one fixed adapter per port', () => {
        const declared = Object.fromEntries(
            Object.entries(admin.ports).map(([port, declaration]) => [port, declaration.default.id])
        );
        expect(declared).toEqual(EXPECTED_DEFAULTS);
        for (const declaration of Object.values(admin.ports)) {
            expect(declaration.alternatives ?? []).toEqual([]);
        }
    });

    it('resolves every port to its default when config names none', async () => {
        const { started, log } = await start();

        const chosen = Object.fromEntries(Object.entries(started.choices).map(([port, choice]) => [port, choice.id]));
        expect(chosen).toEqual(EXPECTED_DEFAULTS);
        expect(Object.values(started.choices).every(choice => choice.origin === 'default')).toBe(true);
        expect(log.mock.calls.map(([line]) => line)).toContain('storage → storage.admin-tab (default)');
    });

    it('initialises config with the console ports before resolving', async () => {
        const { config } = await start();

        expect(config.init).toHaveBeenCalledTimes(1);
        expect(config.init).toHaveBeenCalledWith(webConfigPorts);
    });

    it('builds the session on the console stores, not on copies of them', async () => {
        const { createRuntime, initEngine } = await start();

        const [ports] = createRuntime.mock.calls[0] as [{ storage: Record<string, unknown> }];
        expect(ports.storage.secret).toBe(tabStore);
        expect(ports.storage.plain).toBe(tabStore);
        expect(ports.storage.device).toBe(deviceStore);
        expect(initEngine).toHaveBeenCalledTimes(1);
    });

    it('keeps a port on its default when a config row asks for another adapter', async () => {
        const { started } = await start(key =>
            key === 'port.storage' ? { value: 'storage.local', origin: 'local' } : undefined
        );

        expect(started.choices.storage.id).toBe('storage.admin-tab');
        expect(started.choices.storage.fellBack).toMatchObject({ requested: 'storage.local', from: 'local' });
    });
});
