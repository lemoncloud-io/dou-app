import { EventEmitter } from 'node:events';
import { runInNewContext } from 'node:vm';

import type { SubWebViewContext } from '@chatic/bridge-messages';
import { JsonProtocol } from '@chatic/bridges';
import * as electron from 'electron';

import { pushedEventErrors, pushedEvents } from '../appEventContract';
import { createDesktopSubBridgeHost } from './desktopSubBridgeHost';
import {
    acceptsSubWebViewMessage,
    allowsSubWebViewFrame,
    barTitleOf,
    buildDesktopSubWebViewContextScript,
    decideDesktopSubWebViewNavigation,
    displayOf,
    fetchesManifest,
    modalLayoutOf,
    readDesktopSubWebViewManifest,
    SUB_WEBVIEW_BAR_HEIGHT,
    subWebViewBootOf,
    subWebViewWebPreferences,
} from './desktopSubWebViewPolicy';
import { DesktopSubWebViewService, forwardSubWebViewClosed } from './DesktopSubWebViewService';
import { attachDesktopSubWebView } from './desktopSubWebViewWindow';
import { chromeTitleScript } from './subWebViewChrome';
import { SUB_WEBVIEW_BOOT_CHANNEL, SUB_WEBVIEW_CLOSE_URL, SUB_WEBVIEW_TO_APP_CHANNEL } from './subWebViewContract';

// Electron cannot load under jest. The window code is exercised against these fakes, which record
// what it asked electron to do; `__state` hands the records to the tests.
jest.mock('electron', () => {
    const { EventEmitter: Emitter } = jest.requireActual('node:events');
    const state = {
        views: [] as any[],
        sessions: new Map<string, any>(),
        manifest: null as unknown,
    };
    class FakeWebContents extends Emitter {
        url = '';
        destroyed = false;
        openHandler: ((details: { url: string }) => { action: string }) | null = null;
        mainFrame = { name: 'main', parent: null };
        loadURL = jest.fn(async (url: string) => {
            this.url = url;
        });
        getURL = () => this.url;
        send = jest.fn();
        executeJavaScript = jest.fn(async () => undefined);
        setWindowOpenHandler = jest.fn((handler: any) => {
            this.openHandler = handler;
        });
        close = jest.fn(() => {
            this.destroyed = true;
        });
        isDestroyed = () => this.destroyed;
        focus = jest.fn();
    }
    class WebContentsView {
        webContents = new FakeWebContents();
        setBounds = jest.fn();
        setVisible = jest.fn();
        setBackgroundColor = jest.fn();
        constructor(public options: any) {
            state.views.push(this);
        }
    }
    const fromPartition = jest.fn((name: string) => {
        if (!state.sessions.has(name)) {
            state.sessions.set(name, {
                setPermissionRequestHandler: jest.fn(),
                setPermissionCheckHandler: jest.fn(),
                setDevicePermissionHandler: jest.fn(),
                on: jest.fn(),
                fetch: jest.fn(async () => new Response(JSON.stringify(state.manifest))),
            });
        }
        return state.sessions.get(name);
    });
    return {
        WebContentsView,
        ipcMain: new Emitter(),
        session: { fromPartition },
        shell: { openExternal: jest.fn(async () => undefined) },
        __state: state,
    };
});

const mocked = electron as unknown as {
    __state: { views: any[]; sessions: Map<string, any>; manifest: unknown };
    ipcMain: EventEmitter;
    shell: { openExternal: jest.Mock };
};

const flush = () => new Promise(resolve => setImmediate(resolve));

const context = (params: Record<string, unknown> = {}): SubWebViewContext => ({
    protocolVersion: 1,
    viewId: 'view-1',
    platform: 'desktop',
    appVersion: '1.2.3',
    locale: 'ko',
    theme: 'dark',
    params,
});

describe('DesktopSubWebViewService', () => {
    const createService = () => {
        let n = 0;
        return new DesktopSubWebViewService(undefined, () => `view-${++n}`);
    };

    it.each([
        ['the hub', 'https://apps.chatic.io/', 'firstParty', 'https://apps.chatic.io'],
        ['a reviewed page', 'https://dou-raise.apps.chatic.io/play', 'reviewed', 'https://dou-raise.apps.chatic.io'],
        ['an owner’s own site', 'https://Example.com/app?x=1', 'external', 'https://example.com'],
    ])('opens %s, recording its tier and origin', (_label, url, trust, origin) => {
        const result = createService().open({ url, params: { a: 1 } });

        expect(result).toEqual({ ok: true, view: { viewId: 'view-1', url, origin, trust, params: { a: 1 } } });
    });

    it.each([
        ['http', { url: 'http://example.com/' }, 'INVALID'],
        ['no url', {}, 'INVALID'],
        ['a title that is not a string', { url: 'https://example.com/', title: 3 }, 'INVALID'],
        ['params over 16 KiB', { url: 'https://example.com/', params: { a: 'x'.repeat(17 * 1024) } }, 'INVALID'],
        ['an app id that is not one label', { url: 'https://example.com/', appId: 'a.b' }, 'INVALID'],
        ['userinfo', { url: 'https://x@apps.chatic.io/' }, 'NOT_ALLOWED'],
        ['a port', { url: 'https://apps.chatic.io:8443/' }, 'NOT_ALLOWED'],
        ['an IP literal', { url: 'https://10.0.0.1/' }, 'NOT_ALLOWED'],
    ])('refuses %s', (_label, request, code) => {
        expect(createService().open(request as { url: unknown })).toEqual({ ok: false, code });
    });

    it('opens one view at a time', () => {
        const service = createService();
        service.open({ url: 'https://example.com/' });

        expect(service.open({ url: 'https://apps.chatic.io/' })).toEqual({ ok: false, code: 'ALREADY_OPEN' });
    });

    it('closes the view it names, with the result the page handed back', () => {
        const service = createService();
        const events: unknown[] = [];
        service.subscribe(event => events.push(event));
        service.open({ url: 'https://apps.chatic.io/' });

        expect(service.close('view-2', 'page')).toEqual({ ok: false, code: 'NOT_OPEN' });
        expect(service.close('view-1', 'page', { a: 'x'.repeat(17 * 1024) })).toEqual({ ok: false, code: 'INVALID' });
        expect(service.close('view-1', 'page', { action: 'openMiniAppLinkSettings' })).toEqual({ ok: true });
        expect(events[1]).toEqual({
            type: 'closed',
            viewId: 'view-1',
            reason: 'page',
            notifyHost: true,
            result: { action: 'openMiniAppLinkSettings' },
        });
        expect(service.current()).toBeNull();
    });

    it("tells the web with 'OnSubWebViewClosed', result included", () => {
        const service = createService();
        const host = { pushEvent: jest.fn() };
        forwardSubWebViewClosed(service, host as never);
        service.open({ url: 'https://apps.chatic.io/' });

        service.close('view-1', 'page', { action: 'openMiniAppLinkSettings' });

        expect(host.pushEvent.mock.calls).toEqual([
            [
                {
                    type: 'OnSubWebViewClosed',
                    success: true,
                    data: { viewId: 'view-1', reason: 'page', result: { action: 'openMiniAppLinkSettings' } },
                },
            ],
        ]);
        expect(pushedEventErrors(pushedEvents(host.pushEvent))).toEqual([]);
    });

    it('removes the view without telling the web when the web reloaded under it', () => {
        const service = createService();
        const host = { pushEvent: jest.fn() };
        forwardSubWebViewClosed(service, host as never);
        service.open({ url: 'https://apps.chatic.io/' });

        service.resetForNewHost();

        expect(service.current()).toBeNull();
        expect(host.pushEvent).not.toHaveBeenCalled();
    });
});

describe('the sub view policy', () => {
    const opened = 'https://quiz.apps.chatic.io';

    it.each([
        ['the opened origin', 'https://quiz.apps.chatic.io/level/2', 'load'],
        ['the opened origin in another case', 'HTTPS://Quiz.Apps.Chatic.IO/', 'load'],
        ['about:blank', 'about:blank', 'load'],
        ['another https site', 'https://example.com/', 'external'],
        ['another reviewed page', 'https://other.apps.chatic.io/', 'external'],
        ['an http site', 'http://example.com/', 'block'],
        ['mail', 'mailto:a@example.com', 'block'],
        ['the app’s own scheme', 'chatic://room/1', 'block'],
        ['javascript', 'javascript:alert(1)', 'block'],
        ['userinfo that hides the real host', 'https://quiz.apps.chatic.io@evil.example/', 'block'],
        ['a backslash', 'https://evil.example\\@quiz.apps.chatic.io/', 'block'],
        ['an invite link', 'https://app.chatic.io/i?t=abc', 'block'],
    ])('decides %s (%s) as %s', (_label, url, decision) => {
        expect(decideDesktopSubWebViewNavigation(url, opened)).toBe(decision);
    });

    it('lets a frame load web and in-memory documents only', () => {
        expect(allowsSubWebViewFrame('https://youtube.com/embed/x')).toBe(true);
        expect(allowsSubWebViewFrame('blob:https://quiz.apps.chatic.io/1')).toBe(true);
        expect(allowsSubWebViewFrame('chatic://room/1')).toBe(false);
        expect(allowsSubWebViewFrame('file:///etc/passwd')).toBe(false);
    });

    it.each([
        ['the opened page', { url: 'https://quiz.apps.chatic.io/a', isMainFrame: true }, true],
        ['a frame on the same origin', { url: 'https://quiz.apps.chatic.io/a', isMainFrame: false }, false],
        ['the page after it reached another origin', { url: 'https://example.com/', isMainFrame: true }, false],
        ['a frame that has gone', { url: undefined, isMainFrame: true }, false],
    ])('hears %s: %s', (_label, sender, heard) => {
        expect(acceptsSubWebViewMessage(sender, opened)).toBe(heard);
    });

    it('never asks an external site for a manifest, and always shows it with the bar', () => {
        expect(fetchesManifest('external')).toBe(false);
        expect(fetchesManifest('reviewed')).toBe(true);
        expect(fetchesManifest('firstParty')).toBe(true);
        expect(displayOf('external', { display: 'fullscreen' })).toBe('standard');
        expect(displayOf('reviewed', { display: 'fullscreen' })).toBe('fullscreen');
        expect(displayOf('firstParty', {})).toBe('standard');
    });

    it('titles an external site with its host, whatever the page or the web asked for', () => {
        const view = { trust: 'external' as const, origin: 'https://example.com', title: 'DoU 로그인' };

        expect(barTitleOf(view, { requested: 'DoU', document: 'DoU — Sign in', manifestName: 'DoU' })).toBe(
            'example.com'
        );
    });

    it('titles a trusted page with what it asked for, then its document, the web’s title, its manifest, its host', () => {
        const view = { trust: 'reviewed' as const, origin: 'https://quiz.apps.chatic.io', title: 'Quiz' };

        expect(barTitleOf(view, { requested: 'Level 2', document: 'Doc', manifestName: 'M' })).toBe('Level 2');
        expect(barTitleOf(view, { document: 'Doc', manifestName: 'M' })).toBe('Doc');
        expect(barTitleOf(view, { manifestName: 'M' })).toBe('Quiz');
        expect(barTitleOf({ ...view, title: undefined }, { manifestName: 'M' })).toBe('M');
        expect(barTitleOf({ ...view, title: undefined }, {})).toBe('quiz.apps.chatic.io');
    });

    it('reads a manifest field by field, ignoring what it does not know', () => {
        expect(readDesktopSubWebViewManifest({ manifestVersion: 1, name: ' Hub ', display: 'standard' })).toEqual({
            name: 'Hub',
            display: 'standard',
        });
        expect(readDesktopSubWebViewManifest({ manifestVersion: 1, name: 'x'.repeat(101), display: 'tv' })).toEqual({});
        expect(readDesktopSubWebViewManifest({ manifestVersion: 2, name: 'Hub' })).toEqual({});
        expect(readDesktopSubWebViewManifest(null)).toEqual({});
    });

    it('isolates the page view like the main window, in a session of its own origin, with nothing on its command line', () => {
        const preferences = subWebViewWebPreferences({ preload: '/p.js', origin: opened });

        expect(preferences).toEqual({
            preload: '/p.js',
            partition: 'persist:sub-webview:https://quiz.apps.chatic.io',
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            nodeIntegrationInSubFrames: false,
            webviewTag: false,
        });
        const boot = subWebViewBootOf(context(), opened);
        expect(boot.origin).toBe(opened);
        expect(boot.script).toBe(buildDesktopSubWebViewContextScript(context(), opened));
    });

    it('defines the context on the opened origin only, frozen', () => {
        const script = buildDesktopSubWebViewContextScript(context({ nested: { a: 1 }, __proto__x: '\u2028' }), opened);
        const there: any = { location: { origin: opened } };
        const elsewhere: any = { location: { origin: 'https://example.com' } };

        runInNewContext(script, { window: there, Object, JSON });
        runInNewContext(script, { window: elsewhere, Object, JSON });

        expect(there.ChaticSubWebView.params.nested).toEqual({ a: 1 });
        expect(Object.isFrozen(there.ChaticSubWebView.params.nested)).toBe(true);
        expect(() => {
            'use strict';
            there.ChaticSubWebView = {};
        }).toThrow();
        expect(elsewhere.ChaticSubWebView).toBeUndefined();
    });

    it('puts the page under the bar, inside a card for standard and over the whole window for fullscreen', () => {
        const standard = modalLayoutOf({ width: 1280, height: 800 }, 'standard');
        const fullscreen = modalLayoutOf({ width: 1280, height: 800 }, 'fullscreen');

        expect(standard.card).toEqual({ x: 160, y: 40, width: 960, height: 720 });
        expect(standard.page).toEqual({
            x: 160,
            y: 40 + SUB_WEBVIEW_BAR_HEIGHT,
            width: 960,
            height: 720 - SUB_WEBVIEW_BAR_HEIGHT,
        });
        expect(fullscreen.page).toEqual({
            x: 0,
            y: SUB_WEBVIEW_BAR_HEIGHT,
            width: 1280,
            height: 800 - SUB_WEBVIEW_BAR_HEIGHT,
        });
    });
});

describe('the sub view host', () => {
    const createHost = () => {
        const service = new DesktopSubWebViewService(undefined, () => 'view-1');
        service.open({ url: 'https://quiz.apps.chatic.io/' });
        const sent: any[] = [];
        const deps = {
            service,
            viewId: 'view-1',
            origin: 'https://quiz.apps.chatic.io',
            getContext: () => context(),
            setTitle: jest.fn(),
            logPageError: jest.fn(),
        };
        const host = createDesktopSubBridgeHost(raw => sent.push(JsonProtocol.decode(raw)), deps);
        const send = async (type: string, data: unknown) => {
            const refId = `ref-${sent.length}-${type}`;
            await host.handleMessage(JsonProtocol.encode({ type, data, refId, version: '1' } as never) as string);
            return sent.find(reply => reply.refId === refId);
        };
        return { service, deps, send };
    };

    it('lists exactly its subset in the handshake, with the page context for the desktop', async () => {
        const reply = await createHost().send('WebAppReady', {});

        expect([...reply.data.supportedWebMessages].sort()).toEqual([
            'FinishSubWebView',
            'Ping',
            'ReportSubWebViewError',
            'SetSubWebViewTitle',
            'WebAppReady',
        ]);
        expect(reply.data.subWebView).toEqual(context());
        expect(reply.data.subWebViewOpenScope).toBeUndefined();
    });

    it.each(['CopyToClipboard', 'OpenURL', 'GetSubWebViewUserKey', 'OpenSubWebView', 'StorageGet'])(
        'answers %s NOT_FOUND',
        async type => {
            const reply = await createHost().send(type, {});

            expect(reply.error.code).toBe('NOT_FOUND');
        }
    );

    it('closes its own view with the page’s result', async () => {
        const { service, send } = createHost();

        expect((await send('FinishSubWebView', { result: { a: 'x'.repeat(17 * 1024) } })).error.code).toBe('INVALID');
        expect(await send('FinishSubWebView', { result: { action: 'openMiniAppLinkSettings' } })).toEqual(
            expect.objectContaining({ type: 'OnFinishSubWebView', success: true })
        );
        expect(service.current()).toBeNull();
        expect((await send('FinishSubWebView', {})).error.code).toBe('NOT_OPEN');
    });

    it('hands a title of 1 to 100 characters to the bar', async () => {
        const { deps, send } = createHost();

        expect((await send('SetSubWebViewTitle', { title: '   ' })).error.code).toBe('INVALID');
        expect((await send('SetSubWebViewTitle', { title: 'x'.repeat(101) })).error.code).toBe('INVALID');
        await send('SetSubWebViewTitle', { title: ' Level 2 ' });
        expect(deps.setTitle).toHaveBeenCalledWith('Level 2');
    });

    it('records 20 error reports a load, cut to size', async () => {
        const { deps, send } = createHost();
        for (let i = 0; i < 20; i++) await send('ReportSubWebViewError', { message: 'm'.repeat(2000) });

        expect((await send('ReportSubWebViewError', { message: 'late' })).data).toEqual({ recorded: false });
        expect(deps.logPageError).toHaveBeenCalledTimes(20);
        expect(deps.logPageError.mock.calls[0][0].message).toHaveLength(1000);
        expect(deps.logPageError.mock.calls[0][0].origin).toBe('https://quiz.apps.chatic.io');
    });
});

describe('the sub view window', () => {
    const createWindow = () => {
        const contents = Object.assign(new EventEmitter(), { focus: jest.fn() });
        const win = Object.assign(new EventEmitter(), {
            getContentSize: () => [1280, 800],
            contentView: { addChildView: jest.fn(), removeChildView: jest.fn() },
            webContents: contents,
            destroyed: false,
            isDestroyed(): boolean {
                return this.destroyed;
            },
        });
        return win;
    };

    const setup = () => {
        mocked.__state.views.length = 0;
        mocked.__state.sessions.clear();
        mocked.__state.manifest = null;
        mocked.shell.openExternal.mockClear();
        mocked.ipcMain.removeAllListeners();
        const win = createWindow();
        let n = 0;
        const service = new DesktopSubWebViewService(undefined, () => `view-${++n}`);
        const host = { pushEvent: jest.fn() };
        forwardSubWebViewClosed(service, host as never);
        const logWarn = jest.fn();
        const detach = attachDesktopSubWebView(win as never, service, {
            preloadPath: '/out/preload/subWebView.js',
            appVersion: '1.2.3',
            language: () => 'en',
            dark: () => false,
            logPageError: jest.fn(),
            logWarn,
        });
        const [chrome, page] = [() => mocked.__state.views[0], () => mocked.__state.views[1]];
        return { win, service, host, detach, chrome, page, logWarn };
    };

    const ipcEvent = (sender: any, frame: any, url: string) => {
        frame.url = url;
        return { sender, senderFrame: frame };
    };

    it('shows an external site over the main window, isolated, without asking it for a manifest', async () => {
        const { win, service, chrome, page } = setup();

        service.open({ url: 'https://example.com/app' });
        await flush();

        expect(win.contentView.addChildView.mock.calls.map(call => call[0])).toEqual([chrome(), page()]);
        expect(page().options.webPreferences).toEqual(
            expect.objectContaining({
                sandbox: true,
                contextIsolation: true,
                nodeIntegration: false,
                preload: '/out/preload/subWebView.js',
                partition: 'persist:sub-webview:https://example.com',
            })
        );
        expect(page().webContents.loadURL).toHaveBeenCalledWith('https://example.com/app');
        const ses = mocked.__state.sessions.get('persist:sub-webview:https://example.com');
        expect(ses.fetch).not.toHaveBeenCalled();
        expect(ses.setPermissionRequestHandler).toHaveBeenCalled();
        // The page takes the keys once it is shown.
        expect(page().webContents.focus).toHaveBeenCalled();
        // The bar shows the host, even after the page titles itself as something else.
        page().webContents.emit('page-title-updated', {}, 'DoU — Sign in');
        expect(chrome().webContents.executeJavaScript).toHaveBeenLastCalledWith(chromeTitleScript('example.com'));
    });

    it('hands an external site no device: every chooser is answered with none, and device access is refused', async () => {
        const { service, page } = setup();

        // An origin no other test opens: a session is prepared once, on its first view.
        service.open({ url: 'https://devices.example/app' });
        await flush();

        const ses = mocked.__state.sessions.get('persist:sub-webview:https://devices.example');
        expect(ses.setDevicePermissionHandler.mock.calls[0][0]({ deviceType: 'usb' })).toBe(false);
        const listenerOf = (name: string) => ses.on.mock.calls.find((call: any[]) => call[0] === name)?.[1];
        const answer = (listener: (...args: any[]) => void, ...args: any[]) => {
            const event = { preventDefault: jest.fn() };
            const callback = jest.fn();
            listener(event, ...args, callback);
            return { prevented: event.preventDefault.mock.calls.length, chose: callback.mock.calls[0] };
        };
        expect(answer(listenerOf('select-hid-device'), {})).toEqual({ prevented: 1, chose: [null] });
        expect(answer(listenerOf('select-usb-device'), {})).toEqual({ prevented: 1, chose: [] });
        expect(answer(listenerOf('select-serial-port'), [], {})).toEqual({ prevented: 1, chose: [''] });
        const bluetooth = page().webContents.listeners('select-bluetooth-device')[0];
        expect(answer(bluetooth, [{ deviceId: 'speaker' }])).toEqual({ prevented: 1, chose: [''] });
    });

    it('reads a reviewed page’s manifest from its own origin before showing it, and applies its display', async () => {
        const { service, page } = setup();
        mocked.__state.manifest = { manifestVersion: 1, name: 'Quiz', display: 'fullscreen' };

        service.open({ url: 'https://quiz.apps.chatic.io/' });
        await flush();

        const ses = mocked.__state.sessions.get('persist:sub-webview:https://quiz.apps.chatic.io');
        expect(ses.fetch).toHaveBeenCalledWith(
            'https://quiz.apps.chatic.io/.well-known/chatic-app.json',
            expect.objectContaining({ redirect: 'error' })
        );
        expect(page().setBounds).toHaveBeenLastCalledWith({
            x: 0,
            y: SUB_WEBVIEW_BAR_HEIGHT,
            width: 1280,
            height: 800 - SUB_WEBVIEW_BAR_HEIGHT,
        });
    });

    it('keeps the view on its origin and hands another https site to the OS', async () => {
        const { service, page } = setup();
        service.open({ url: 'https://example.com/' });
        await flush();
        const contents = page().webContents;

        const away = { preventDefault: jest.fn() };
        contents.emit('will-navigate', away, 'https://other.example/');
        const stay = { preventDefault: jest.fn() };
        contents.emit('will-navigate', stay, 'https://example.com/next');
        const redirect = { preventDefault: jest.fn(), url: 'https://evil.example/', isMainFrame: true };
        contents.emit('will-redirect', redirect);
        const scheme = { preventDefault: jest.fn() };
        contents.emit('will-navigate', scheme, 'chatic://room/1');

        expect(away.preventDefault).toHaveBeenCalled();
        expect(stay.preventDefault).not.toHaveBeenCalled();
        expect(redirect.preventDefault).toHaveBeenCalled();
        expect(scheme.preventDefault).toHaveBeenCalled();
        expect(mocked.shell.openExternal.mock.calls).toEqual([['https://other.example/'], ['https://evil.example/']]);
        expect(service.current()?.url).toBe('https://example.com/');
    });

    it('blocks a frame’s redirect where the frame rule does, and never hands it to the OS', async () => {
        const { service, page } = setup();
        service.open({ url: 'https://example.com/' });
        await flush();
        const contents = page().webContents;

        const embed = { preventDefault: jest.fn(), url: 'https://ads.example/', isMainFrame: false };
        contents.emit('will-redirect', embed);
        const scheme = { preventDefault: jest.fn(), url: 'chatic://room/1', isMainFrame: false };
        contents.emit('will-redirect', scheme);

        expect(embed.preventDefault).not.toHaveBeenCalled();
        expect(scheme.preventDefault).toHaveBeenCalled();
        expect(mocked.shell.openExternal).not.toHaveBeenCalled();
    });

    it('opens no second window: the page’s origin loads in place, another site goes to the OS', async () => {
        const { service, page } = setup();
        service.open({ url: 'https://example.com/' });
        await flush();
        const contents = page().webContents;

        expect(contents.openHandler({ url: 'https://example.com/popup' })).toEqual({ action: 'deny' });
        expect(contents.openHandler({ url: 'https://other.example/' })).toEqual({ action: 'deny' });

        expect(contents.loadURL).toHaveBeenLastCalledWith('https://example.com/popup');
        expect(mocked.shell.openExternal).toHaveBeenCalledWith('https://other.example/');
    });

    it('hands at most three URLs to the OS browser in ten seconds, so a page cannot open tabs in a loop', async () => {
        const { service, page, logWarn } = setup();
        service.open({ url: 'https://example.com/' });
        await flush();
        const contents = page().webContents;
        const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

        for (let i = 0; i < 5; i += 1) contents.openHandler({ url: `https://other.example/${i}` });
        expect(mocked.shell.openExternal).toHaveBeenCalledTimes(3);
        expect(logWarn).toHaveBeenCalledWith('openExternal dropped: too many in a row', 'https://other.example/3');

        now.mockReturnValue(1_010_000);
        contents.openHandler({ url: 'https://other.example/later' });
        expect(mocked.shell.openExternal).toHaveBeenLastCalledWith('https://other.example/later');
        now.mockRestore();
    });

    it('hears the page’s main frame on the opened origin only', async () => {
        const { service, page } = setup();
        service.open({ url: 'https://apps.chatic.io/' });
        await flush();
        const contents = page().webContents;
        const finish = JsonProtocol.encode({
            type: 'FinishSubWebView',
            data: { result: { action: 'openMiniAppLinkSettings' } },
            refId: 'r1',
            version: '1',
        } as never) as string;

        mocked.ipcMain.emit(
            SUB_WEBVIEW_TO_APP_CHANNEL,
            ipcEvent(contents, { parent: contents.mainFrame }, 'https://apps.chatic.io/'),
            finish
        );
        mocked.ipcMain.emit(
            SUB_WEBVIEW_TO_APP_CHANNEL,
            ipcEvent({ mainFrame: contents.mainFrame }, contents.mainFrame, 'https://apps.chatic.io/'),
            finish
        );
        await flush();
        expect(service.current()).not.toBeNull();

        mocked.ipcMain.emit(
            SUB_WEBVIEW_TO_APP_CHANNEL,
            ipcEvent(contents, contents.mainFrame, 'https://apps.chatic.io/'),
            finish
        );
        await flush();
        expect(service.current()).toBeNull();
    });

    it('tells the page’s main frame its boot data on the opened origin, and no one else', async () => {
        const { service, page, chrome } = setup();
        service.open({ url: 'https://apps.chatic.io/' });
        await flush();
        const contents = page().webContents;
        // Electron sends the reply the moment `returnValue` is first set; a later assignment never
        // reaches the renderer. The fake answers with the first value, as the real one does.
        const ask = (event: any) => {
            const replies: unknown[] = [];
            Object.defineProperty(event, 'returnValue', { set: (value: unknown) => replies.push(value) });
            mocked.ipcMain.emit(SUB_WEBVIEW_BOOT_CHANNEL, event);
            expect(replies).toHaveLength(1);
            return replies[0];
        };

        const boot = ask(ipcEvent(contents, contents.mainFrame, 'https://apps.chatic.io/'));
        expect(boot.origin).toBe('https://apps.chatic.io');
        expect(boot.script).toContain('ChaticSubWebView');
        expect(ask(ipcEvent(contents, { parent: contents.mainFrame }, 'https://apps.chatic.io/'))).toBeNull();
        expect(ask(ipcEvent(contents, contents.mainFrame, 'https://example.com/'))).toBeNull();
        expect(
            ask(ipcEvent(chrome().webContents, chrome().webContents.mainFrame, 'https://apps.chatic.io/'))
        ).toBeNull();
    });

    it('closes as user on Esc and on the bar’s close control, and removes both views', async () => {
        const { win, service, host, chrome, page } = setup();
        service.open({ url: 'https://example.com/' });
        await flush();

        const esc = { preventDefault: jest.fn() };
        page().webContents.emit('before-input-event', esc, { type: 'keyDown', key: 'Escape' });

        expect(esc.preventDefault).toHaveBeenCalled();
        expect(host.pushEvent.mock.calls[0][0].data).toEqual({ viewId: 'view-1', reason: 'user' });
        expect(win.contentView.removeChildView).toHaveBeenCalledWith(page());
        expect(win.contentView.removeChildView).toHaveBeenCalledWith(chrome());
        expect(page().webContents.close).toHaveBeenCalled();

        service.open({ url: 'https://example.com/' });
        await flush();
        const close = { preventDefault: jest.fn() };
        mocked.__state.views[2].webContents.emit('will-navigate', close, SUB_WEBVIEW_CLOSE_URL);
        expect(close.preventDefault).toHaveBeenCalled();
        expect(host.pushEvent.mock.calls[1][0].data).toEqual({ viewId: 'view-2', reason: 'user' });
    });

    it('removes the view without telling the page when the main window loads a new page', async () => {
        const { win, service, host } = setup();
        service.open({ url: 'https://example.com/' });
        await flush();

        win.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true });
        expect(service.current()).not.toBeNull();
        win.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });

        expect(service.current()).toBeNull();
        expect(host.pushEvent).not.toHaveBeenCalled();
    });

    it('shows its error in the card when the page fails to load', async () => {
        const { service, page, chrome } = setup();
        service.open({ url: 'https://example.com/' });
        await flush();

        expect(chrome().webContents.focus).toHaveBeenCalled();
        chrome().webContents.focus.mockClear();
        page().webContents.emit('did-fail-load', {}, -3, 'ABORTED', 'https://example.com/', true);
        expect(page().setVisible).not.toHaveBeenCalled();
        page().webContents.emit('did-fail-load', {}, -105, 'NAME_NOT_RESOLVED', 'https://example.com/', true);

        expect(page().setVisible).toHaveBeenCalledWith(false);
        // The hidden page cannot take Esc; the card holds the keys instead.
        expect(chrome().webContents.focus).toHaveBeenCalled();
        expect(
            chrome().webContents.executeJavaScript.mock.calls.some((call: string[]) =>
                call[0].startsWith('window.__error')
            )
        ).toBe(true);
        expect(service.current()).not.toBeNull();
    });

    it('shows its error in the card, and says why, when the page view cannot be put up', async () => {
        const { win, service, chrome, logWarn } = setup();
        mocked.__state.manifest = { manifestVersion: 1, name: 'Quiz' };
        win.contentView.addChildView.mockImplementation((view: any) => {
            if (view !== mocked.__state.views[0]) throw new Error('window gone');
        });

        service.open({ url: 'https://quiz.apps.chatic.io/' });
        await flush();

        expect(logWarn).toHaveBeenCalledWith('sub webview page could not be shown', 'Error: window gone');
        expect(
            chrome().webContents.executeJavaScript.mock.calls.some((call: string[]) =>
                call[0].startsWith('window.__error')
            )
        ).toBe(true);
        expect(service.current()).not.toBeNull();
    });

    it('closes the views’ contents when detached from a window that is already destroyed', async () => {
        const { win, service, host, detach, chrome, page } = setup();
        service.open({ url: 'https://example.com/' });
        await flush();

        win.destroyed = true;
        detach();

        expect(win.contentView.removeChildView).not.toHaveBeenCalled();
        expect(page().webContents.close).toHaveBeenCalled();
        expect(chrome().webContents.close).toHaveBeenCalled();
        expect(service.current()).toBeNull();
        expect(host.pushEvent).not.toHaveBeenCalled();
    });
});
