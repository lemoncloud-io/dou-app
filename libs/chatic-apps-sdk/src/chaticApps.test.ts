import { connect, connectOver, type ChaticApps } from './chaticApps';
import { installChaticAppsMock, type MockController, type MockOptions } from './mock';
import type { Transport } from './transport';

/** Lets the mock's asynchronous replies and pushes land. */
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

describe('connect, against the mock app', () => {
    let mock: MockController | undefined;
    let apps: ChaticApps | undefined;

    const start = async (options: MockOptions = {}, reportErrors = false) => {
        mock = installChaticAppsMock({ log: false, ...options });
        apps = await connect({ reportErrors });
        return { mock, apps };
    };

    afterEach(() => {
        apps?.disconnect();
        mock?.uninstall();
        apps = undefined;
        mock = undefined;
    });

    it('shakes hands and takes the context from the reply', async () => {
        const { apps } = await start({ context: { theme: 'dark', params: { level: 3 } } });

        expect(apps.inApp).toBe(true);
        expect(apps.context).toEqual(
            expect.objectContaining({ protocolVersion: 1, theme: 'dark', params: { level: 3 } })
        );
    });

    it('offers the base set, and a gated call only with its permission', async () => {
        const { apps } = await start({ permissions: ['share'] });

        expect(apps.supports('title')).toBe(true);
        expect(apps.supports('share')).toBe(true);
        expect(apps.supports('userKey')).toBe(false);
        await expect(apps.getUserKey()).rejects.toEqual(expect.objectContaining({ code: 'NOT_SUPPORTED' }));
        await expect(apps.share({ message: 'hi' })).resolves.toBe('shared');
    });

    it('answers a user key when the page holds the permission', async () => {
        const { apps } = await start({ permissions: ['userKey'], userKey: 'a'.repeat(64) });

        await expect(apps.getUserKey()).resolves.toBe('a'.repeat(64));
    });

    it("hands the app's refusal back with its code", async () => {
        const { apps } = await start();

        await expect(apps.setTitle('')).rejects.toEqual(expect.objectContaining({ code: 'INVALID' }));
    });

    it('finishes the view with a result, and a second finish is NOT_OPEN', async () => {
        const onClose = jest.fn();
        const { apps, mock } = await start({ onClose });

        await apps.finish({ score: 12 });

        expect(onClose).toHaveBeenCalledWith({ by: 'page', result: { score: 12 } });
        expect(mock.closed).toEqual({ by: 'page', result: { score: 12 } });
        await expect(apps.finish()).rejects.toEqual(expect.objectContaining({ code: 'NOT_OPEN' }));
    });

    it('refuses a result over 16 KiB, as the app does', async () => {
        const { apps } = await start();

        await expect(apps.finish({ blob: 'x'.repeat(17 * 1024) })).rejects.toEqual(
            expect.objectContaining({ code: 'INVALID' })
        );
    });

    it('calls the back handler on Android back, and closes on back once it is cleared', async () => {
        const { apps, mock } = await start();
        const onBack = jest.fn();

        apps.onBack(onBack);
        await settle();
        mock.pressBack();
        await settle();
        expect(onBack).toHaveBeenCalledTimes(1);

        // Without the claim, back goes to the view's history, and with none left it closes the view.
        apps.onBack(null);
        await settle();
        mock.pressBack();
        await settle();
        expect(onBack).toHaveBeenCalledTimes(1);
        expect(mock.closed).toEqual({ by: 'user' });
    });

    it('asks the page before closing, and finishes when it agrees', async () => {
        const { apps, mock } = await start();
        const handler = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        apps.onCloseRequest(handler);
        await settle();

        mock.requestClose('back');
        await settle();
        expect(handler).toHaveBeenLastCalledWith('back');
        expect(mock.closed).toBeNull();

        await new Promise(resolve => setTimeout(resolve, 0));
        jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 10_000);
        mock.requestClose('control');
        await settle();
        expect(handler).toHaveBeenLastCalledWith('control');
        expect(mock.closed).toEqual({ by: 'page', result: undefined });
        jest.restoreAllMocks();
    });

    // A page restored from the back-forward cache keeps its handlers but not its claims.
    it('sets its claims again when the page shows', async () => {
        const { apps, mock } = await start();
        const onBack = jest.fn();
        apps.onBack(onBack);
        await settle();

        window.dispatchEvent(new Event('pageshow'));
        await settle();
        mock.pressBack();
        await settle();

        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('hears a theme change', async () => {
        const { apps, mock } = await start();
        const listener = jest.fn();
        apps.onContextChange(listener);

        mock.changeContext({ theme: 'dark' });
        await settle();

        expect(listener).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }));
        expect(apps.context?.theme).toBe('dark');
    });

    it("keeps the page's data in the app's storage, without a permission", async () => {
        const { apps, mock } = await start({ storage: { seen: true } });

        expect(apps.supports('storage')).toBe(true);
        await apps.storage.setMany({ level: 3, best: { score: 12 } });
        await apps.storage.remove('seen');

        await expect(apps.storage.get('level')).resolves.toBe(3);
        await expect(apps.storage.getMany(['best', 'seen'])).resolves.toEqual({ best: { score: 12 } });
        await expect(apps.storage.keys()).resolves.toEqual(['level', 'best']);
        await expect(apps.storage.usage()).resolves.toEqual({ used: 22, limit: 1048576 });
        expect(mock.storage).toEqual({ level: 3, best: { score: 12 } });
        await apps.storage.clear();
        expect(mock.storage).toEqual({});
    });

    it('refuses a storage seed the app would refuse', () => {
        expect(() => installChaticAppsMock({ log: false, storage: { '': 1 } })).toThrow('options.storage');
    });

    it("hands back the storage's refusals with their codes", async () => {
        const { apps } = await start();

        await expect(apps.storage.set('a', 'x'.repeat(60 * 1024))).resolves.toBeUndefined();
        await expect(apps.storage.set('b', 'x'.repeat(70 * 1024))).rejects.toEqual(
            expect.objectContaining({ code: 'TOO_LARGE' })
        );
        await expect(apps.storage.get('')).rejects.toEqual(expect.objectContaining({ code: 'INVALID' }));
    });

    it("builds links from the context's appLink, with the params as the query", async () => {
        const { apps } = await start({ context: { appLink: 'https://app.chatic.io/apps/quiz' } });

        expect(apps.link({ level: 3, seed: 'a b', hard: true })).toBe(
            'https://app.chatic.io/apps/quiz?level=3&seed=a+b&hard=true'
        );
        expect(apps.link()).toBe('https://app.chatic.io/apps/quiz');
        expect(apps.link({})).toBe('https://app.chatic.io/apps/quiz');
    });

    it.each([
        ['a path', '/level/3'],
        ['an array', ['a']],
        ['null', null],
    ])('refuses %s, which is no object of params', async (_label, params) => {
        const { apps } = await start({ context: { appLink: 'https://app.chatic.io/apps/quiz' } });

        expect(() => apps.link(params as never)).toThrow(expect.objectContaining({ code: 'INVALID' }));
    });

    it("builds links from the page's own root in an app before appLink", async () => {
        const { apps } = await start({ context: { appLink: undefined } });

        expect(apps.link({ level: 3 })).toBe(`${location.origin}/?level=3`);
    });

    it('returns the one connection to a second caller', async () => {
        const { apps } = await start();

        await expect(connect()).resolves.toBe(apps);
    });

    it('fails the calls still waiting when it disconnects', async () => {
        const { apps } = await start({ permissions: ['share'] });
        (window as unknown as { ReactNativeWebView: { postMessage(m: string): void } }).ReactNativeWebView.postMessage =
            () => undefined;

        const waiting = apps.share({ message: 'x' });
        apps.disconnect();

        await expect(waiting).rejects.toEqual(expect.objectContaining({ code: 'DISCONNECTED' }));
    });

    // A rejected value can be the user's own data; only its type reaches the log.
    it('reports a non-Error value by its type alone, and survives one it cannot read', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { apps } = await start();
        const circular: Record<string, unknown> = { email: 'someone@example.com' };
        circular.self = circular;

        await expect(apps.reportError(circular)).resolves.toBe(true);

        expect(warn).toHaveBeenCalledWith(
            '[chatic-apps mock] page error',
            'A non-Error value was thrown: [object Object]',
            ''
        );
        warn.mockRestore();
    });

    // A page restored from the back-forward cache meets a fresh host, possibly in another theme.
    it('shakes hands again on a restore from the back-forward cache, and hears what changed', async () => {
        const { apps, mock } = await start();
        const listener = jest.fn();
        apps.onContextChange(listener);
        mock.changeContext({ theme: 'dark' });
        await settle();
        listener.mockClear();
        // What a fresh host would report after a restore; the snapshot global stays as it was.
        mock.changeContext({ theme: 'light' });
        const restored = new Event('pageshow') as Event & { persisted?: boolean };
        Object.defineProperty(restored, 'persisted', { value: true });

        window.dispatchEvent(restored);
        await settle();

        expect(apps.context?.theme).toBe('light');
    });

    it('reports uncaught errors to the app when asked to', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        await start({}, true);

        window.dispatchEvent(new ErrorEvent('error', { error: new Error('boom'), message: 'boom' }));
        await settle();

        expect(warn).toHaveBeenCalledWith('[chatic-apps mock] page error', 'boom', expect.any(String));
        warn.mockRestore();
    });

    it('refuses an app that speaks another protocol major', async () => {
        installChaticAppsMock({ log: false, context: { protocolVersion: 2 as never } });

        await expect(connect({ reportErrors: false })).rejects.toEqual(
            expect.objectContaining({ code: 'UNSUPPORTED_PROTOCOL' })
        );
        delete (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView;
    });
});

describe('connect, in a browser tab', () => {
    it('stands in for what the browser can do, and refuses what needs the app', async () => {
        const apps = await connect();

        expect(apps.inApp).toBe(false);
        expect(apps.supports('share')).toBe(false);
        await apps.setTitle('Quiz');
        expect(document.title).toBe('Quiz');
        await expect(apps.finish()).rejects.toEqual(expect.objectContaining({ code: 'NOT_IN_APP' }));
        await expect(apps.getUserKey()).rejects.toEqual(expect.objectContaining({ code: 'NOT_IN_APP' }));
        expect(apps.link({ a: 1 })).toBe(`${location.origin}/?a=1`);
    });

    it('keeps storage in the browser, under the same calls', async () => {
        const apps = await connect();

        await apps.storage.set('level', 3);

        await expect(apps.storage.get('level')).resolves.toBe(3);
        await apps.storage.clear();
    });

    it('treats only a cancel as dismissed, and copies on any other share failure', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
        const share = jest
            .fn()
            .mockRejectedValueOnce(Object.assign(new Error('cancel'), { name: 'AbortError' }))
            .mockRejectedValueOnce(Object.assign(new Error('no gesture'), { name: 'NotAllowedError' }));
        Object.defineProperty(navigator, 'share', { configurable: true, value: share });
        const apps = await connect();

        await expect(apps.share({ message: 'Try it' })).resolves.toBe('dismissed');
        await expect(apps.share({ message: 'Try it' })).resolves.toBe('copied');
        await expect(apps.share({})).rejects.toEqual(expect.objectContaining({ code: 'INVALID' }));
        Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    });

    it('copies when there is no share sheet', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
        const apps = await connect();

        await expect(apps.share({ message: 'Try it', url: 'https://x.example' })).resolves.toBe('copied');
        expect(writeText).toHaveBeenCalledWith('Try it https://x.example');
    });
});

describe('connect, over a transport the test drives', () => {
    it('fails the connection when the handshake is refused', async () => {
        let listener: ((message: string) => void) | undefined;
        const transport: Transport = {
            send: raw => {
                const { refId } = JSON.parse(raw);
                listener?.(JSON.stringify({ type: 'ERROR', success: false, error: { code: 'INTERNAL_ERROR' }, refId }));
            },
            listen: next => {
                listener = next;
                return () => undefined;
            },
        };

        await expect(connectOver(transport, { reportErrors: false })).rejects.toEqual(
            expect.objectContaining({ code: 'INTERNAL_ERROR' })
        );
    });
});
