/**
 * The declaration exists to start the account surface's runtime exactly as it started before it: every
 * port on one fixed adapter, config from the build's env reader, and the session on the site's own store
 * objects. Those are what the cases pin.
 */
import { startRuntime } from '@chatic/runtime-web';
import type { StartRuntimeOptions } from '@chatic/runtime-web';

import { deviceStore, tabStore } from '../app/storage';
import { landingRuntime } from './landing';

const EXPECTED_DEFAULTS = {
    storage: 'storage.landing-tab',
    transport: 'transport.browser',
    auth: 'auth.location',
    cache: 'cache.landing-web-storage',
    foreground: 'foreground.visibility',
} as const;

type Read = NonNullable<StartRuntimeOptions['read']>;

const ENV: Record<string, string> = { VITE_DOU_ENDPOINT: 'https://api.example.com/dou-d1' };
const env = (name: string): string | undefined => ENV[name];

/** Starts the declaration with every collaborator faked except the adapters themselves. */
const start = async (read: Read = () => undefined) => {
    const config = { init: vi.fn(), isInitialized: vi.fn(() => false), snapshot: vi.fn(() => undefined) };
    const createRuntime = vi.fn((_ports: unknown) => ({}) as never);
    const initEngine = vi.fn();
    const log = vi.fn();
    const started = await startRuntime(landingRuntime(env), { config, read, createRuntime, initEngine, log });
    return { started, config, createRuntime, initEngine };
};

describe('landing runtime declaration', () => {
    it('declares one fixed adapter per port', () => {
        const { ports } = landingRuntime(env);
        const declared = Object.fromEntries(
            Object.entries(ports).map(([port, declaration]) => [port, declaration.default.id])
        );
        expect(declared).toEqual(EXPECTED_DEFAULTS);
        for (const declaration of Object.values(ports)) expect(declaration.alternatives ?? []).toEqual([]);
    });

    it('resolves every port to its default when config names none', async () => {
        const { started } = await start();

        const chosen = Object.fromEntries(Object.entries(started.choices).map(([port, choice]) => [port, choice.id]));
        expect(chosen).toEqual(EXPECTED_DEFAULTS);
    });

    it("initialises config once, from the build's env reader", async () => {
        const { config } = await start();

        expect(config.init).toHaveBeenCalledTimes(1);
        const [ports] = config.init.mock.calls[0] as [{ env: { raw(name: string): string | undefined } }];
        expect(ports.env.raw('VITE_DOU_ENDPOINT')).toBe('https://api.example.com/dou-d1');
    });

    it('builds the session on the site stores, not on copies of them', async () => {
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

        expect(started.choices.storage.id).toBe('storage.landing-tab');
        expect(started.choices.storage.fellBack).toMatchObject({ requested: 'storage.local', from: 'local' });
    });
});
