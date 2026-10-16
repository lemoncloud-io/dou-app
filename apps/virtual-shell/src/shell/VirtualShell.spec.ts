import { resolveDeepLink, resolvePushTapPath } from 'virtual-shell/mobile-deeplink';
import { getSafeAreaScript, getSyncInjectionScript } from 'virtual-shell/mobile-injection';

import { guardAppInjection } from '@chatic/fake-shell';

import { APPLE_SIGN_IN_UNSUPPORTED, type SignInDriver } from './shellHandlers';
import { VirtualShell } from './VirtualShell';

type Received = { type: string; refId?: string; data?: unknown; success?: boolean; error?: { code: string } };
type ShellWindow = Window & {
    ReactNativeWebView: { postMessage: (raw: string) => void };
    CHATIC_APP_CONFIG_BAG?: unknown;
};

const settle = () => new Promise(resolve => setTimeout(resolve, 5));
const relayRoomPush = { type: 'chat', link: '/channels/1000001/room', payload: { cid: '#', sid: '100002' } };

/**
 * A shell attached to this test's own window, standing in for the frame: what the shell dispatches
 * lands on `window` (iOS) or `document` (Android), and the page side posts through
 * `window.ReactNativeWebView` as the web does.
 */
const setup = (signIn: Partial<SignInDriver> = {}) => {
    const cancel = vi.fn();
    const shell = new VirtualShell(
        { env: 'dev', googleClientId: 'client' },
        {
            getSyncInjectionScript: guardAppInjection({ getSyncInjectionScript }),
            getSafeAreaScript,
            resolvePushTapPath,
            resolveDeepLink,
        },
        { signInWithGoogle: async () => null, signOut: () => undefined, cancel, ...signIn }
    );
    /** How many times the shell asked for a new frame. */
    const relaunches = () => shell.launchId - 1;
    const received: Received[] = [];
    const onWindow = (event: Event) =>
        received.push({ ...JSON.parse((event as MessageEvent).data), on: 'window' } as Received);
    const onDocument = (event: Event) =>
        received.push({ ...JSON.parse((event as MessageEvent).data), on: 'document' } as Received);
    window.addEventListener('message', onWindow);
    document.addEventListener('message', onDocument);
    /** The frame of the current launch attaching, as `inject.js` does. */
    const attach = () => shell.attach(window, String(shell.launchId));
    const post = async (message: Record<string, unknown>) => {
        (window as unknown as ShellWindow).ReactNativeWebView.postMessage(JSON.stringify(message));
        await settle();
    };
    const handshake = async () => {
        attach();
        await post({ type: 'WebAppReady', refId: 'ready', data: {} });
    };
    const types = () => received.map(message => message.type);
    const cleanup = () => {
        window.removeEventListener('message', onWindow);
        document.removeEventListener('message', onDocument);
    };
    return { shell, relaunches, cancel, received, post, attach, handshake, types, cleanup };
};

let current: ReturnType<typeof setup> | null = null;
const make = (signIn?: Partial<SignInDriver>) => (current = setup(signIn));
afterEach(() => current?.cleanup());

describe('VirtualShell boot', () => {
    it("injects the app's boot globals for this device and backend before the page runs", () => {
        const { attach } = make();
        attach();

        const win = window as unknown as Record<string, unknown>;
        expect(win['CHATIC_APP_PLATFORM']).toBe('ios');
        expect(win['CHATIC_APP_STAGE']).toBe('stage');
        expect(document.documentElement.style.getPropertyValue('--safe-top')).toBe('59px');
        expect(typeof (window as unknown as ShellWindow).ReactNativeWebView.postMessage).toBe('function');
    });

    it('reports what it answers in the handshake, and leaves the push token out', async () => {
        const { shell, handshake } = make();
        await handshake();

        const status = shell.status();
        expect(status.handshake).toBe('ready');
        expect(status.capabilities).toEqual(
            expect.arrayContaining(['FetchCacheData', 'SaveConfigValue', 'FetchBackgroundStatus', 'OAuthLogin'])
        );
        expect(status.capabilities).not.toContain('FetchFcmToken');
    });

    it('starts every launch by reporting the app as active, as the app does when it mounts', async () => {
        const { types, handshake } = make();
        await handshake();

        expect(types()[0]).toBe('OnBackgroundStatusChanged');
    });

    it('answers a request it does not imitate NOT_FOUND, logs it each time and shows it once', async () => {
        const { shell, received, post, handshake } = make();
        await handshake();

        await post({ type: 'FetchFcmToken', refId: 'f1', data: {} });
        await post({ type: 'FetchFcmToken', refId: 'f2', data: {} });

        expect(received.find(message => message.refId === 'f1')).toMatchObject({
            type: 'ERROR',
            error: { code: 'NOT_FOUND' },
        });
        expect(shell.readLogs({ source: ['unsupported'] }).map(entry => entry.type)).toEqual([
            'FetchFcmToken',
            'FetchFcmToken',
        ]);
        expect(shell.toasts.map(toast => toast.text)).toEqual(['Not supported in the virtual shell: FetchFcmToken']);
    });
});

describe('VirtualShell settings', () => {
    it('keeps a config value across a restart by injecting it again at the next boot', async () => {
        const { shell, received, post, handshake } = make();
        await handshake();
        await post({ type: 'SaveConfigValue', refId: 's1', data: { key: 'ui.onboardingCompleted', value: 'true' } });

        await shell.restart({}, 'api');
        (window as unknown as ShellWindow).CHATIC_APP_CONFIG_BAG = undefined;
        shell.attach(window, shell.launchId);

        expect(received.find(message => message.refId === 's1')).toMatchObject({
            success: true,
            data: { success: true },
        });
        expect((window as unknown as ShellWindow).CHATIC_APP_CONFIG_BAG).toEqual({ 'ui.onboardingCompleted': 'true' });
        expect(shell.readLogs({ source: ['unsupported'] })).toEqual([]);
    });

    it('refuses a preference key the app does not let the web write', async () => {
        const { received, post, handshake } = make();
        await handshake();

        await post({ type: 'SavePreference', refId: 'p1', data: { key: 'debugSettings', value: {} } });
        await post({ type: 'SavePreference', refId: 'p2', data: { key: 'blurLastMessage', value: true } });
        await post({ type: 'FetchPreference', refId: 'p3', data: { key: 'blurLastMessage' } });

        expect(received.find(message => message.refId === 'p1')).toMatchObject({
            success: false,
            error: { code: 'PREF_KEY_NOT_WRITABLE' },
        });
        expect(received.find(message => message.refId === 'p3')).toMatchObject({
            data: { key: 'blurLastMessage', value: true },
        });
    });

    it('answers the app state it is in', async () => {
        const { shell, received, post, handshake } = make();
        await handshake();
        await shell.appBackground('api');

        await post({ type: 'FetchBackgroundStatus', refId: 'b1', data: {} });

        expect(received.find(message => message.refId === 'b1')).toMatchObject({
            type: 'OnBackgroundStatusChanged',
            data: { status: 'background', isBackground: true, isForeground: false },
        });
    });
});

describe('VirtualShell push', () => {
    it('shows a push in the app while it is active', async () => {
        const { shell, types, handshake } = make();
        await handshake();

        const result = await shell.pushReceive({ title: 'Hi', body: 'there' }, 'api');
        await settle();

        expect(result).toEqual({ ok: true, sent: ['OnReceiveNotification'] });
        expect(types()).toContain('OnReceiveNotification');
    });

    it('keeps a push for the notification centre while the app is away, sending nothing', async () => {
        const { shell, types, handshake } = make();
        await handshake();
        await shell.appBackground('api');
        await settle();
        const before = types().length;

        const result = await shell.pushReceive({ title: 'Hi', data: relayRoomPush }, 'api');
        await settle();

        expect(result).toEqual({ ok: true, sent: [] });
        expect(types()).toHaveLength(before);
        expect(shell.notifications).toHaveLength(1);
    });

    it('refuses a push with nothing in it', async () => {
        const { shell } = make();

        expect(await shell.pushReceive({}, 'api')).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    });

    it('opens the room on a warm tap, then brings the app to the front', async () => {
        const { shell, types, handshake } = make();
        await handshake();
        await shell.appBackground('api');
        await settle();
        const before = types().length;

        const result = await shell.pushTap(relayRoomPush, {}, 'api');
        await settle();

        expect(result).toEqual({
            ok: true,
            sent: ['OnNavigate', 'OnBackgroundStatusChanged'],
            path: '/channels/1000001/room?cid=%23&sid=100002',
        });
        expect(types().slice(before)).toEqual(['OnNavigate', 'OnBackgroundStatusChanged']);
        expect(shell.status().appState).toBe('active');
    });

    it('only brings the app forward for a tap with nowhere to go', async () => {
        const { shell, handshake } = make();
        await handshake();
        await shell.appBackground('api');

        const result = await shell.pushTap({ type: 'chat' }, {}, 'api');

        expect(result).toEqual({ ok: true, sent: ['OnBackgroundStatusChanged'], path: null });
    });

    it('relaunches on a cold tap and holds the navigation until the new page shakes hands', async () => {
        const { shell, relaunches, received, handshake } = make();
        await handshake();

        const result = await shell.pushTap(relayRoomPush, { launch: 'cold' }, 'api');
        await settle();
        const held = received.length;
        shell.attach(window, shell.launchId);
        await (window as unknown as ShellWindow).ReactNativeWebView.postMessage(
            JSON.stringify({ type: 'WebAppReady', refId: 'ready2', data: {} })
        );
        await settle();

        expect(relaunches()).toBe(1);
        expect(result).toMatchObject({ ok: true, queued: true, sent: ['OnBackgroundStatusChanged', 'OnNavigate'] });
        expect(received.slice(held).map(message => message.type)).toEqual([
            'OnBackgroundStatusChanged',
            'OnNavigate',
            'OnWebAppReady',
        ]);
    });
});

describe('VirtualShell deep links', () => {
    it('navigates to the path a link resolves to', async () => {
        const { shell, handshake } = make();
        await handshake();

        const result = await shell.deeplink('https://app-dev.chatic.io/s?code=invt:1:abc&relay', {}, 'api');

        expect(result).toMatchObject({ ok: true, sent: ['OnNavigate'] });
        expect(result.ok && result.path).toContain('relay=1');
    });

    it('refuses the retired short link and a native-screen link', async () => {
        const { shell } = make();

        expect(await shell.deeplink('https://app.chatic.io/s/abc', {}, 'api')).toMatchObject({
            ok: false,
            error: 'UNRESOLVED',
        });
        expect(await shell.deeplink('chatic-dev://debug/Home?target=native', {}, 'api')).toMatchObject({
            ok: false,
            error: 'NATIVE_ROUTE',
        });
    });
});

describe('VirtualShell app state and back', () => {
    it('goes to the background the way each platform reports it, and sends nothing a second time', async () => {
        const { shell, handshake } = make();
        await handshake();

        expect(await shell.appBackground('api')).toEqual({
            ok: true,
            sent: ['OnBackgroundStatusChanged', 'OnBackgroundStatusChanged'],
        });
        expect(await shell.appBackground('api')).toEqual({ ok: true, sent: [] });
        expect(await shell.appForeground('api')).toEqual({ ok: true, sent: ['OnBackgroundStatusChanged'] });

        await shell.deviceSet({ preset: 'android' }, 'api');
        expect(await shell.appBackground('api')).toMatchObject({ ok: true, sent: ['OnBackgroundStatusChanged'] });
    });

    it('has no back button on iOS', async () => {
        const { shell } = make();

        expect(await shell.back('api')).toMatchObject({ ok: false, error: 'PLATFORM_MISMATCH' });
    });

    it('forwards back while the page holds an overlay, and closes the app when nothing is behind', async () => {
        const { shell, post, handshake, received } = make();
        await shell.deviceSet({ preset: 'android' }, 'api');
        await handshake();

        await post({ type: 'SetCanGoBack', data: { canGoBack: true } });
        expect(await shell.back('api')).toMatchObject({ ok: true, sent: ['OnBackPressed'] });
        await settle();
        expect(received.at(-1)).toMatchObject({ type: 'OnBackPressed', on: 'document' });

        await post({ type: 'SetCanGoBack', data: { canGoBack: false } });
        expect(await shell.back('api')).toEqual({ ok: true, sent: [], exited: true });
        expect(shell.hasExited).toBe(true);
    });
});

describe('VirtualShell restart and device', () => {
    it('keeps the cache across a restart unless asked to clear it', async () => {
        const { shell } = make();
        shell.cache.seed('channel', { cid: 'c', uid: 'u' }, [{ id: 'x' }]);

        await shell.restart({}, 'api');
        expect(shell.cache.rows('channel', { cid: 'c', uid: 'u' })).toHaveLength(1);
        await shell.restart({ clearCache: true }, 'api');
        expect(shell.cache.rows('channel', { cid: 'c', uid: 'u' })).toEqual([]);
    });

    it('becomes another phone through a relaunch, and refuses one it does not know', async () => {
        const { shell, relaunches } = make();

        expect(await shell.deviceSet({ preset: 'android', theme: 'dark' }, 'api')).toMatchObject({ ok: true });
        expect(relaunches()).toBe(1);
        expect(shell.status()).toMatchObject({
            platform: 'android',
            device: 'android',
            theme: 'dark',
            handshake: 'pending',
        });
        expect(await shell.deviceSet({ preset: 'tablet' }, 'api')).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    });
});

describe('VirtualShell waitFor and the log', () => {
    it('returns a line already there at once, and names what crossed on a timeout', async () => {
        const { shell, handshake } = make();
        await handshake();

        const ready = await shell.waitFor('WebAppReady', { source: 'web→shell' });
        expect(ready).toMatchObject({ ok: true, entry: { type: 'WebAppReady' } });
        const missing = await shell.waitFor('OnNavigate', { since: shell.logs.lastSeq, timeout: 20 });
        expect(missing).toMatchObject({ ok: false, error: 'TIMEOUT' });
    });

    it('resolves on the next matching line', async () => {
        const { shell, handshake } = make();
        await handshake();
        const mark = shell.logs.lastSeq;

        const waiting = shell.waitFor('OnNavigate', { source: 'shell→web', since: mark, timeout: 1000 });
        await shell.deeplink('/channels/1000001/room', {}, 'api');

        expect(await waiting).toMatchObject({ ok: true, entry: { type: 'OnNavigate', source: 'shell→web' } });
    });

    it('records every tool call with its caller', async () => {
        const { shell } = make();

        await shell.appForeground('panel');

        expect(shell.readLogs({ source: ['tool'] }).at(-1)).toMatchObject({
            type: 'app.foreground',
            data: { by: 'panel', result: { ok: true, sent: [] } },
        });
    });
});

describe('VirtualShell sign-in', () => {
    it('hands the Google result back as the app does, and never logs the token itself', async () => {
        const idToken = `eyJhbGciOi${'x'.repeat(1174)}`;
        const { shell, received, post, handshake } = make({
            signInWithGoogle: async () => ({ provider: 'google', platform: 'ios', idToken }),
        });
        await handshake();

        await post({ type: 'OAuthLogin', data: { provider: 'google' } });

        expect(received.find(message => message.type === 'OnOAuthLogin')).toMatchObject({
            data: { result: { idToken } },
        });
        const logged = JSON.stringify(shell.readLogs());
        expect(logged).not.toContain(idToken);
        expect(logged).toContain('eyJhbG…(1184)');
    });

    it('fails an Apple sign-in the way the app fails one, and marks it unsupported', async () => {
        const { shell, received, post, handshake } = make();
        await handshake();

        await post({ type: 'OAuthLogin', data: { provider: 'apple' } });

        expect(received.find(message => message.type === 'OnOAuthLogin')).toMatchObject({
            success: false,
            error: { code: 'OAUTH_LOGIN_ERROR' },
        });
        expect(shell.toasts.map(toast => toast.text)).toContain(APPLE_SIGN_IN_UNSUPPORTED);
    });
});

describe('VirtualShell launches', () => {
    it('turns away a frame of an earlier launch, and drops what that frame still posts', async () => {
        const { shell, attach, handshake, received } = make();
        await handshake();
        const oldPost = (window as unknown as ShellWindow).ReactNativeWebView.postMessage;

        await shell.restart({}, 'api');
        expect(shell.attach(window, shell.launchId - 1)).toBe(false);
        expect(attach()).toBe(true);
        oldPost(JSON.stringify({ type: 'FetchBadgeBase', refId: 'stale', data: {} }));
        await settle();

        // Neither answered into the new page, nor counted as that page's first word to the bridge.
        expect(received.find(message => message.refId === 'stale')).toBeUndefined();
        expect(shell.readLogs({ source: ['web→shell'] }).some(entry => entry.refId === 'stale')).toBe(false);
        expect(await shell.pushReceive({ title: 'Hi' }, 'api')).toMatchObject({ queued: true });
        expect(shell.readLogs({ type: 'stale-frame' })).toHaveLength(1);
    });

    it('cancels a sign-in still waiting when the app relaunches', async () => {
        const { shell, cancel } = make();

        await shell.restart({}, 'api');

        expect(cancel).toHaveBeenCalled();
    });

    it('is ready once the documented wait — the handshake reply, OnWebAppReady — resolves', async () => {
        const { shell, attach, post } = make();
        attach();
        let seen: string | null = null;
        const waiting = shell.waitFor('OnWebAppReady', { source: 'shell→web' }).then(() => {
            seen = shell.status().handshake;
        });

        await post({ type: 'WebAppReady', refId: 'ready', data: {} });
        await waiting;

        expect(seen).toBe('ready');
    });

    it('sends straight to a page reloaded inside the frame, as the app does across a WebView reload', async () => {
        const { shell, attach, handshake } = make();
        await handshake();

        attach();
        const result = await shell.pushReceive({ title: 'Hi' }, 'api');

        expect(shell.status().handshake).toBe('pending');
        expect(result).toEqual({ ok: true, sent: ['OnReceiveNotification'] });
    });

    it('opens a closed app on a tap, a link or bringing it to the front', async () => {
        const { shell, post, handshake } = make();
        await shell.deviceSet({ preset: 'android' }, 'api');
        await handshake();
        await post({ type: 'SetCanGoBack', data: { canGoBack: false } });
        await shell.back('api');
        expect(shell.status().exited).toBe(true);

        const tap = await shell.pushTap(relayRoomPush, {}, 'api');
        expect(tap).toMatchObject({ ok: true, queued: true, sent: ['OnBackgroundStatusChanged', 'OnNavigate'] });
        expect(shell.status().exited).toBe(false);

        await shell.back('api');
        const launch = shell.launchId;
        await shell.appForeground('api');
        expect(shell.launchId).toBe(launch + 1);
    });

    it('keeps answering status when the frame has gone to another origin', () => {
        const { shell } = make();
        const foreign = {
            closed: false,
            get location(): never {
                throw new DOMException('cross-origin', 'SecurityError');
            },
            get history(): never {
                throw new DOMException('cross-origin', 'SecurityError');
            },
        };
        // The frame window is private; a frame that navigated away is what it would hold.
        (shell as unknown as { frameWindow: unknown }).frameWindow = foreign;

        expect(shell.status()).toMatchObject({ path: '', historyCanGoBack: false });
        expect(shell.readLogs({ type: 'frame-left-origin' })).toHaveLength(1);
    });

    it('answers a call with no input instead of throwing', async () => {
        const { shell } = make();

        expect(await shell.deviceSet(undefined as never, 'api')).toMatchObject({ ok: true });
        expect(await shell.pushTap(undefined as never, undefined, 'api')).toMatchObject({
            ok: false,
            error: 'INVALID_INPUT',
        });
    });
});

describe('VirtualShell known rooms', () => {
    it('offers the rooms the app cached, most recently active first, the relay marked as a push marks it', () => {
        const { shell } = make();
        shell.cache.seed('channel', { cid: 'default', uid: 'u1' }, [
            { id: 'U:u1', cid: 'default', sid: '0000', name: '', updatedAt: 1 },
        ]);
        shell.cache.seed('channel', { cid: 'cloud1', uid: 'u1' }, [
            { id: 'ch9', cid: 'cloud1', sid: 's9', name: 'Team', updatedAt: 3 },
            { id: 'u1@u2', cid: 'cloud1', sid: 's9', name: '', updatedAt: 2 },
        ]);

        expect(shell.knownRooms()).toEqual([
            { channelId: 'ch9', cid: 'cloud1', sid: 's9', name: 'Team', relay: false, kind: 'group', updatedAt: 3 },
            { channelId: 'u1@u2', cid: 'cloud1', sid: 's9', name: '', relay: false, kind: 'direct', updatedAt: 2 },
            { channelId: 'U:u1', cid: '#', sid: '0000', name: '', relay: true, kind: 'self', updatedAt: 1 },
        ]);
    });
});

describe('VirtualShell theme', () => {
    it("sets the app's theme where both the app and the web keep it, then relaunches", async () => {
        const webStorage = { setItem: vi.fn() };
        const shell = new VirtualShell(
            { env: 'dev', googleClientId: '' },
            {
                getSyncInjectionScript: guardAppInjection({ getSyncInjectionScript }),
                getSafeAreaScript,
                resolvePushTapPath,
                resolveDeepLink,
            },
            { signInWithGoogle: async () => null, signOut: () => undefined, cancel: () => undefined },
            webStorage
        );

        await shell.deviceSet({ theme: 'dark' }, 'api');
        shell.attach(window, shell.launchId);

        expect(webStorage.setItem).toHaveBeenCalledWith('vite-ui-theme', 'dark');
        expect((window as unknown as Record<string, unknown>)['CHATIC_APP_THEME']).toBe('dark');
        expect(shell.status().theme).toBe('dark');
    });
});

describe('VirtualShell signed-in user', () => {
    it("takes the user from the page's cache requests", async () => {
        const { shell, post, handshake } = make();
        await handshake();
        expect(shell.signedInUserId()).toBeNull();

        await post({
            type: 'FetchCacheData',
            refId: 'c1',
            data: { type: 'user', cid: 'default', uid: '1001494', id: 'x' },
        });

        expect(shell.signedInUserId()).toBe('1001494');
    });
});

describe('VirtualShell keyboard', () => {
    it('raises the keyboard the way the app does, by re-running its safe-area script with the height', async () => {
        const { shell, attach } = make();
        attach();

        expect(await shell.keyboardShow(undefined, 'api')).toEqual({ ok: true, sent: [] });
        expect(document.documentElement.style.getPropertyValue('--keyboard-height')).toBe('336px');
        expect(shell.status().keyboardHeight).toBe(336);

        await shell.keyboardShow(280, 'api');
        expect(document.documentElement.style.getPropertyValue('--keyboard-height')).toBe('280px');
        await shell.keyboardHide('api');
        expect(document.documentElement.style.getPropertyValue('--keyboard-height')).toBe('0px');
    });

    it('refuses a height that is not on the screen, and is down again after a relaunch', async () => {
        const { shell, attach } = make();
        attach();

        expect(await shell.keyboardShow(5000, 'api')).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
        await shell.keyboardShow(300, 'api');
        await shell.restart({}, 'api');
        expect(shell.status().keyboardHeight).toBe(0);
    });
});

describe('VirtualShell badge', () => {
    it('shows what the web last set the badge to', async () => {
        const { shell, post, handshake } = make();
        await handshake();
        expect(shell.status().badge).toBeNull();

        await post({ type: 'SetBadgeCount', data: { count: 7 } });
        expect(shell.status().badge).toBe(7);
        await post({ type: 'SetBadgeCount', data: { count: 0 } });
        expect(shell.status().badge).toBe(0);
    });
});

describe('VirtualShell storage', () => {
    it('shows the cache by domain and cloud, the settings and the preferences, masked', async () => {
        const { shell, post, handshake } = make();
        await handshake();
        shell.cache.seed('channel', { cid: 'cloud1', uid: 'u1' }, [{ id: 'ch1', name: 'Team' }]);
        shell.cache.seed('user', { cid: 'default', uid: 'u1' }, [{ id: 'u1', accessToken: 'secret-token-value' }]);
        await post({ type: 'SaveConfigValue', refId: 's1', data: { key: 'ui.theme', value: '"dark"' } });
        await post({ type: 'SavePreference', refId: 'p1', data: { key: 'blurLastMessage', value: true } });

        const view = shell.storageView();

        expect(view.cache).toEqual(
            expect.arrayContaining([
                { domain: 'channel', cloud: 'cloud1', count: 1, rows: [{ id: 'ch1', name: 'Team' }] },
                { domain: 'user', cloud: 'default', count: 1, rows: [{ id: 'u1', accessToken: 'secret…(18)' }] },
            ])
        );
        expect(view.configBag).toEqual({ 'ui.theme': 'dark' });
        expect(view.preferences).toEqual({ blurLastMessage: true });
    });
});

describe('VirtualShell events.push', () => {
    it('sends any listed event as given, saying the contract was not checked', async () => {
        const { shell, types, handshake } = make();
        await handshake();

        const result = await shell.eventsPush('OnUpdateDeviceInfo', { stage: 'stage' }, 'api');
        await settle();

        expect(result).toEqual({ ok: true, sent: ['OnUpdateDeviceInfo'], contract: 'unchecked' });
        expect(types()).toContain('OnUpdateDeviceInfo');
        expect(shell.eventTypes()).toContain('OnNavigate');
    });

    it('refuses a type that is not an app event', async () => {
        const { shell } = make();

        expect(await shell.eventsPush('OnMadeUp', {}, 'api')).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    });

    it('cannot be called through the API on prod; the panel can, having asked', async () => {
        const shell = new VirtualShell(
            { env: 'prod', googleClientId: '' },
            {
                getSyncInjectionScript: guardAppInjection({ getSyncInjectionScript }),
                getSafeAreaScript,
                resolvePushTapPath,
                resolveDeepLink,
            },
            { signInWithGoogle: async () => null, signOut: () => undefined, cancel: () => undefined },
            null
        );

        expect(await shell.eventsPush('OnNavigate', { path: '/' }, 'api')).toMatchObject({
            ok: false,
            error: 'PROD_BLOCKED',
        });
        expect(await shell.eventsPush('OnNavigate', { path: '/' }, 'panel')).toMatchObject({
            ok: true,
            contract: 'unchecked',
        });
    });
});

describe('VirtualShell device presets', () => {
    it('becomes each of the nine phones, a foldable folding as a relaunch with its own width', async () => {
        const { shell } = make();
        expect(shell.deviceList()).toHaveLength(9);

        await shell.deviceSet({ preset: 'galaxy-fold-folded' }, 'api');
        const folded = shell.launchId;
        await shell.deviceSet({ preset: 'galaxy-fold-unfolded' }, 'api');

        expect(shell.launchId).toBe(folded + 1);
        expect(shell.currentDevice.width).toBe(673);
        for (const device of shell.deviceList()) {
            expect(await shell.deviceSet({ preset: device.id }, 'api')).toMatchObject({ ok: true });
            expect(shell.status()).toMatchObject({ device: device.id, platform: device.platform });
        }
    });
});
