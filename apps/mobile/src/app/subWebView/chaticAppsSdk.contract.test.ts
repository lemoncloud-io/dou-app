import { BRIDGE_VERSION } from '@chatic/bridges';
import { SDK_BRIDGE_VERSION, type Capability } from '@chatic/chatic-apps-sdk';
import { connectOver, type Transport } from '@chatic/chatic-apps-sdk/internal';

import { memoryStorageFile } from '../services/subWebView/memoryStorageFile';
import { SubWebViewService } from '../services/subWebView/SubWebViewService';
import { SubWebViewStorage } from '../services/subWebView/subWebViewStorage';
import { createSubBridgeHost } from './createSubBridgeHost';
import { createSubBridgeHandlers, permittedSubBridgeHandlers } from './subBridgeHandlers';

/**
 * The library pages are built with, against this app's real page host and handlers, in one process.
 * What the library sends is what the host answers, what the host refuses comes back with its code, and
 * the pushes the view sends reach the page's handlers. A change on either side that breaks a page
 * fails here, before a page on a phone finds it.
 */

// Keyed by every capability, so one the library adds fails to compile here until it is listed.
const CAPABILITIES = Object.keys({
    finish: true,
    title: true,
    haptic: true,
    clipboard: true,
    share: true,
    openUrl: true,
    userKey: true,
    back: true,
    closeGuard: true,
    errorReport: true,
    storage: true,
} satisfies Record<Capability, true>) as Capability[];

const ALL = new Set(['clipboard', 'share', 'openUrl', 'userKey'] as const);

const setup = (
    permissions: ReadonlySet<'clipboard' | 'share' | 'openUrl' | 'userKey'> = ALL,
    deviceId = 'device-1'
) => {
    const storage = new SubWebViewStorage(memoryStorageFile());
    const service = new SubWebViewService(
        { warn: jest.fn(), error: jest.fn() } as never,
        ['apps.chatic.io'],
        () => 'view-1'
    );
    service.open({ url: 'https://quiz.apps.chatic.io/' });
    const deps = {
        viewId: 'view-1',
        service,
        clipboard: { setText: jest.fn(async () => undefined) },
        haptic: { trigger: jest.fn(() => true) },
        openExternal: jest.fn(async () => undefined),
        setTitle: jest.fn(),
        openShareSheet: jest.fn(async () => ({ action: 'sharedAction' as const, activityType: null })),
        origin: 'https://quiz.apps.chatic.io',
        getDeviceId: () => deviceId,
        setBackClaim: jest.fn(),
        setCloseGuard: jest.fn(),
        logPageError: jest.fn(),
        openStorage: () => storage,
    };
    let toPage: ((message: string) => void) | undefined;
    const host = createSubBridgeHost(
        // Asynchronous, as the WebView is.
        message => queueMicrotask(() => toPage?.(message)),
        permittedSubBridgeHandlers(createSubBridgeHandlers(deps), permissions),
        () => ({
            protocolVersion: 1,
            viewId: 'view-1',
            platform: 'ios',
            appVersion: '0.31.0',
            locale: 'ko',
            theme: 'light',
            params: { level: 3 },
            appLink: 'https://app.chatic.io/apps/quiz',
        })
    );
    const transport: Transport = {
        send: message => void host.handleMessage(message),
        listen: listener => {
            toPage = listener;
            return () => (toPage = undefined);
        },
    };
    return { host, service, deps, transport };
};

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('chatic-apps-sdk against the page host', () => {
    it('speaks the bridge version this app does', () => {
        expect(SDK_BRIDGE_VERSION).toBe(BRIDGE_VERSION);
    });

    it("takes the context and every capability from the host's handshake", async () => {
        const { transport } = setup();

        const apps = await connectOver(transport, { reportErrors: false });

        expect(apps.context).toEqual(expect.objectContaining({ viewId: 'view-1', params: { level: 3 } }));
        expect(CAPABILITIES.filter(capability => !apps.supports(capability))).toEqual([]);
    });

    it('sees exactly the gated four go when the manifest grants nothing', async () => {
        const { transport } = setup(new Set());

        const apps = await connectOver(transport, { reportErrors: false });

        expect(CAPABILITIES.filter(capability => !apps.supports(capability)).sort()).toEqual(
            ['clipboard', 'openUrl', 'share', 'userKey'].sort()
        );
        await expect(apps.getUserKey()).rejects.toEqual(expect.objectContaining({ code: 'NOT_SUPPORTED' }));
    });

    it('reaches every handler with what it sends', async () => {
        const { transport, deps, service } = setup();
        const apps = await connectOver(transport, { reportErrors: false });

        await apps.setTitle('Quiz');
        apps.haptic('success');
        await apps.copy('hello');
        await expect(apps.share({ message: 'Try it', url: apps.link({ level: 3 }) })).resolves.toBe('shared');
        await expect(apps.getUserKey()).resolves.toMatch(/^[0-9a-f]{64}$/);
        await expect(apps.reportError(new Error('boom'))).resolves.toBe(true);
        await apps.storage.setMany({ level: 3, best: { score: 12 } });
        await apps.storage.remove('level');
        await expect(apps.storage.getMany(['level', 'best'])).resolves.toEqual({ best: { score: 12 } });
        await expect(apps.storage.keys()).resolves.toEqual(['best']);
        await expect(apps.storage.usage()).resolves.toEqual({ used: 16, limit: 1048576 });
        await settle();

        expect(deps.setTitle).toHaveBeenCalledWith('Quiz');
        expect(deps.haptic.trigger).toHaveBeenCalledWith('success');
        expect(deps.clipboard.setText).toHaveBeenCalledWith('hello');
        expect(deps.openShareSheet).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Try it', url: 'https://app.chatic.io/apps/quiz?level=3' })
        );
        expect(deps.logPageError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));

        const events: unknown[] = [];
        service.subscribe(event => events.push(event));
        await apps.finish({ score: 12 });
        expect(events).toEqual([expect.objectContaining({ type: 'closed', reason: 'page', result: { score: 12 } })]);
    });

    it("hands the host's refusals back with their codes", async () => {
        const { transport } = setup(ALL, 'unknown');
        const apps = await connectOver(transport, { reportErrors: false });

        await expect(apps.setTitle('')).rejects.toEqual(expect.objectContaining({ code: 'INVALID' }));
        await expect(apps.openUrl('chatic://s/home')).rejects.toEqual(
            expect.objectContaining({ code: 'LINK_NOT_ALLOWED' })
        );
        await expect(apps.getUserKey()).rejects.toEqual(expect.objectContaining({ code: 'UNAVAILABLE' }));
        await expect(apps.copy('x'.repeat(70 * 1024))).rejects.toEqual(expect.objectContaining({ code: 'TOO_LARGE' }));
        await expect(apps.storage.get('')).rejects.toEqual(expect.objectContaining({ code: 'INVALID' }));
        for (let i = 0; i < 16; i++) await apps.storage.set(`chunk${i}`, 'x'.repeat(64000));
        await expect(apps.storage.set('more', 'x'.repeat(64000))).rejects.toEqual(
            expect.objectContaining({ code: 'QUOTA_EXCEEDED' })
        );
    });

    it("claims back and the close guard, and hears the view's pushes", async () => {
        const { transport, deps, host } = setup();
        const apps = await connectOver(transport, { reportErrors: false });
        const onBack = jest.fn();
        const onClose = jest.fn(() => false);

        apps.onBack(onBack);
        apps.onCloseRequest(onClose);
        await settle();
        host.pushEvent({ type: 'OnBackPressed', success: true, data: {} });
        host.pushEvent({ type: 'OnSubWebViewCloseRequested', success: true, data: { trigger: 'control' } });
        await settle();

        expect(deps.setBackClaim).toHaveBeenLastCalledWith(true);
        expect(deps.setCloseGuard).toHaveBeenLastCalledWith(true);
        expect(onBack).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledWith('control');
    });
});
