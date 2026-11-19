/**
 * `config/desktop-web.spec.ts`
 *
 * The declaration exists to boot the page exactly as its entry point booted it before: every port on
 * one fixed adapter, the session on the window's own store objects, the host ports the entry published
 * by hand, and the chat cache cap. Those are what the cases pin.
 */
import { describe, expect, it, vi } from 'vitest';

import { startRuntime } from '@chatic/runtime-web';
import type { StartRuntimeOptions } from '@chatic/runtime-web';

import { desktopStores } from './adapters';
import { desktopWeb } from './desktop-web';

const EXPECTED_DEFAULTS = {
    storage: 'storage.desktop',
    transport: 'transport.browser',
    auth: 'auth.location',
    cache: 'cache.desktop-web-storage',
    foreground: 'foreground.visibility',
} as const;

const EXPECTED_HOST_DEFAULTS = {
    checkout: 'checkout.none',
    media: 'media.browser',
    files: 'files.browser',
    links: 'links.host',
    appShell: 'appShell.host',
    signIn: 'signIn.host',
    diagnostics: 'diagnostics.host',
    push: 'push.host',
} as const;

type Read = NonNullable<StartRuntimeOptions['read']>;

const idsOf = (choices: Record<string, { id: string }>) =>
    Object.fromEntries(Object.entries(choices).map(([port, choice]) => [port, choice.id]));

/** Starts the declaration with every collaborator faked except the adapters themselves. */
const start = async (read: Read = () => undefined) => {
    const config = { init: vi.fn(), isInitialized: vi.fn(() => false), snapshot: vi.fn(() => undefined) };
    const createRuntime = vi.fn((_ports: unknown) => ({}) as never);
    const initEngine = vi.fn();
    const publishHost = vi.fn();
    const log = vi.fn();
    const started = await startRuntime(desktopWeb, { config, read, createRuntime, initEngine, publishHost, log });
    return { started, config, createRuntime, initEngine, publishHost, log };
};

describe('desktop-web runtime declaration', () => {
    it('declares one fixed adapter per port, host ports included, and no engine', () => {
        const declared = [...Object.values(desktopWeb.ports), ...Object.values(desktopWeb.host ?? {})];

        expect(idsOf(Object.fromEntries(Object.entries(desktopWeb.ports).map(([p, d]) => [p, d.default])))).toEqual(
            EXPECTED_DEFAULTS
        );
        expect(
            idsOf(Object.fromEntries(Object.entries(desktopWeb.host ?? {}).map(([p, d]) => [p, d.default])))
        ).toEqual(EXPECTED_HOST_DEFAULTS);
        for (const declaration of declared) expect(declaration.alternatives ?? []).toEqual([]);
        expect(desktopWeb.engine).toBeUndefined();
    });

    it('resolves every port to its default when config names none', async () => {
        const { started, log } = await start();

        expect(idsOf(started.choices)).toEqual(EXPECTED_DEFAULTS);
        expect(idsOf(started.hostChoices ?? {})).toEqual(EXPECTED_HOST_DEFAULTS);
        expect(started.engineChoice.id).toBe('engine.core');
        expect(Object.values(started.choices).every(choice => choice.origin === 'default')).toBe(true);
        expect(log.mock.calls.map(([line]) => line)).toContain('storage → storage.desktop (default)');
    });

    it('initialises config with the declared ports before resolving', async () => {
        const { config } = await start();

        expect(config.init).toHaveBeenCalledTimes(1);
        expect(config.init).toHaveBeenCalledWith(desktopWeb.config);
    });

    it("publishes a browser tab's host ports, nothing sold", async () => {
        const { publishHost } = await start();

        expect(publishHost).toHaveBeenCalledWith({
            checkout: { kind: 'none' },
            media: { kind: 'browser' },
            files: { kind: 'browser' },
            links: { kind: 'browser' },
            appShell: { kind: 'browser', os: null },
            signIn: { kind: 'browser', os: null },
            diagnostics: { kind: 'browser' },
            push: { kind: 'browser' },
        });
    });

    it("builds the session on the window's stores, with the chat cache capped", async () => {
        const { createRuntime, initEngine } = await start();

        const [ports] = createRuntime.mock.calls[0] as [
            { storage: Record<string, unknown>; data: { cache: { maxChatsPerChannel: number } } },
        ];
        expect(ports.storage).toEqual({
            secret: desktopStores.secret,
            plain: desktopStores.plain,
            device: desktopStores.device,
        });
        expect(ports.storage.secret).toBe(desktopStores.secret);
        expect(ports.storage.device).toBe(desktopStores.device);
        expect(ports.data.cache.maxChatsPerChannel).toBe(1000);
        expect(initEngine).toHaveBeenCalledTimes(1);
    });

    it('keeps a port on its default when a config row asks for another adapter', async () => {
        const { started } = await start(key =>
            key === 'port.storage' ? { value: 'storage.local', origin: 'local' } : undefined
        );

        expect(started.choices.storage.id).toBe('storage.desktop');
        expect(started.choices.storage.fellBack).toMatchObject({ requested: 'storage.local', from: 'local' });
    });
});
