import type { Page } from '@playwright/test';

import { AppBridgeHost } from '@chatic/bridges';
import type {
    AppMessageDataMap,
    AppMessageType,
    WebMessage,
    WebMessageData,
    WebMessageType,
} from '@chatic/app-messages';

import { loadAppInjection, type AppInjectionParams } from './appInjection';
import { FAKE_SHELL_CACHE_TYPES, MemoryCache } from './memoryCache';
import { toHostHandler, type ShellHandler, type ShellHandlerTable } from './handlerTable';

/**
 * Which WebView the shell imitates. They differ in one thing the web can see: react-native-webview
 * dispatches a native → web message on `window` on iOS and on `document` on Android, and the web
 * listens on both — so each browser project runs the path its platform takes.
 */
export type ShellPlatform = 'ios' | 'android';

export interface FakeShellOptions {
    platform: ShellPlatform;
    /** `@chatic/config`'s shell lane, as the app injects it. Onboarding is done unless a test says otherwise. */
    configBag?: Record<string, string>;
    insets?: { top: number; bottom: number; left: number; right: number };
}

type Listener = (message: WebMessage) => void;

const IPHONE_INSETS = { top: 59, bottom: 34, left: 0, right: 0 };
const ANDROID_INSETS = { top: 24, bottom: 0, left: 0, right: 0 };

/** The name the page calls to hand a message to this process. Never part of the app's own API. */
const POST_BINDING = '__e2eFakeShellPost';

/**
 * A native shell for the web app, in the test process.
 *
 * The page gets what react-native-webview gives it: `window.ReactNativeWebView.postMessage` is present
 * before any page script runs (the web polls for it from module scope, so it must already be there),
 * and the app's own injection script then runs on top of it. Each message goes to the same
 * `AppBridgeHost` the mobile app uses, so matching a reply to its request, `NOT_FOUND` for a message
 * without a handler and the WebAppReady handshake are production code; what is fake is only the
 * handlers and the transport. A reply goes back as the WebView delivers it — a JSON string dispatched
 * as a `message` event.
 */
export class FakeShell {
    readonly cache = new MemoryCache();
    private readonly host: AppBridgeHost;
    private readonly log: WebMessage[] = [];
    /** Types registered here, so a message nobody answers can be told from one answered on purpose. */
    private readonly handled = new Set<string>(['WebAppReady']);
    /** Requests the host answered `NOT_FOUND` — as an app build without that handler would. */
    readonly unhandled: string[] = [];
    /**
     * Failures the app's injection script reported about itself. Not a finding about the web: it means
     * this shell no longer injects what the app does, and every scenario on top of it is suspect.
     */
    readonly injectionErrors: string[] = [];
    /** Replies that could not be dispatched into the page for a reason other than it going away. */
    readonly deliveryErrors: string[] = [];
    private readonly listeners = new Set<Listener>();

    private constructor(
        private readonly page: Page,
        private readonly options: FakeShellOptions
    ) {
        this.host = new AppBridgeHost({
            sendToWeb: raw => void this.deliver(raw),
            supportedCacheTypes: [...FAKE_SHELL_CACHE_TYPES],
        });
        this.use(this.cache.handlers());
        this.use(defaultHandlers(options.platform));
    }

    static async install(page: Page, options: FakeShellOptions): Promise<FakeShell> {
        const shell = new FakeShell(page, options);
        const injection = shell.injectionParams();
        const getSyncInjectionScript = await loadAppInjection();
        await page.exposeFunction(POST_BINDING, (raw: string) => shell.receive(raw));
        await page.addInitScript(
            ({ binding, injection }) => {
                // react-native-webview injects into the main frame only.
                if (window.top !== window) return;
                const post = (window as unknown as Record<string, (raw: string) => void>)[binding];
                (window as unknown as { ReactNativeWebView: unknown }).ReactNativeWebView = {
                    postMessage: (raw: string) => post(String(raw)),
                };
                // Indirect eval: the script is the app's own text, and it expects global scope.
                const inject = () => (0, eval)(injection);
                // A Playwright init script runs before the document has a root element, earlier than
                // react-native-webview's "before content loaded" injection, and the app's script styles
                // `document.documentElement`. Run it the moment `<html>` exists instead — still before
                // the parser reaches the page's first script, which is the moment the app relies on.
                if (document.documentElement) {
                    inject();
                } else {
                    const observer = new MutationObserver(() => {
                        if (!document.documentElement) return;
                        observer.disconnect();
                        inject();
                    });
                    observer.observe(document, { childList: true });
                }
            },
            { binding: POST_BINDING, injection: getSyncInjectionScript(injection) }
        );
        return shell;
    }

    /** Adds or replaces handlers. A test changes the shell's answer by registering over the default. */
    use(handlers: ShellHandlerTable): void {
        for (const type of Object.keys(handlers) as WebMessageType[]) {
            this.handle(type, handlers[type] as ShellHandler<typeof type>);
        }
    }

    handle<K extends WebMessageType>(type: K, handler: ShellHandler<K>): void {
        this.handled.add(type);
        this.host.registerHandler(type, toHostHandler(type, handler));
    }

    /** Pushes an app → web event, as the app does for a push tap or a resume. */
    push<K extends AppMessageType>(type: K, data: AppMessageDataMap[K]): void {
        this.host.pushEvent({ type, success: true, data });
    }

    /** Every message the page has sent so far, oldest first. */
    received<K extends WebMessageType>(type: K): WebMessageData<K>[] {
        return this.log.filter(message => message.type === type) as unknown as WebMessageData<K>[];
    }

    /**
     * Resolves with the first message of this type — one already received, or the next to arrive.
     * Rejects after `timeout` naming what the page did send, which says more than a test timeout would.
     */
    waitFor<K extends WebMessageType>(
        type: K,
        predicate: (message: WebMessageData<K>) => boolean = () => true,
        { timeout = 15_000 }: { timeout?: number } = {}
    ): Promise<WebMessageData<K>> {
        const seen = this.received(type).find(predicate);
        if (seen) return Promise.resolve(seen);
        return new Promise((resolve, reject) => {
            const settle = () => {
                this.listeners.delete(listener);
                clearTimeout(timer);
            };
            const timer = setTimeout(() => {
                settle();
                const sent = [...new Set(this.log.map(message => message.type))].join(', ');
                reject(new Error(`waitFor(${type}) timed out after ${timeout}ms; the page sent: ${sent}`));
            }, timeout);
            const listener: Listener = message => {
                if (message.type !== type) return;
                try {
                    if (!predicate(message as WebMessageData<K>)) return;
                } catch (error) {
                    settle();
                    reject(error);
                    return;
                }
                settle();
                resolve(message as WebMessageData<K>);
            };
            this.listeners.add(listener);
        });
    }

    private async receive(raw: string): Promise<void> {
        let message: WebMessage | undefined;
        try {
            message = JSON.parse(raw) as WebMessage;
        } catch {
            // The host decodes it again and logs a malformed message itself.
        }
        if (message) {
            this.log.push(message);
            if (!this.handled.has(message.type)) this.unhandled.push(message.type);
            if (message.type === 'SendLog' && message.data?.tag === 'INJECTION') {
                this.injectionErrors.push(message.data.message ?? '');
            }
            // A copy: a listener that settles removes itself while the set is being walked.
            for (const listener of [...this.listeners]) listener(message);
        }
        await this.host.handleMessage(raw);
    }

    private async deliver(raw: string): Promise<void> {
        const target = this.options.platform === 'ios' ? 'window' : 'document';
        try {
            await this.page.evaluate(
                ({ data, on }) =>
                    (on === 'window' ? window : document).dispatchEvent(new MessageEvent('message', { data })),
                { data: raw, on: target }
            );
        } catch (error) {
            // The page navigated or closed between request and reply. The real shell drops the reply
            // in that case too (`webViewRef.current` is gone), and the web never matches it. Anything
            // else is this shell failing to answer, and would otherwise surface only as the web's own
            // bridge timeout.
            if (this.page.isClosed() || /Execution context was destroyed|has been closed/.test(String(error))) return;
            this.deliveryErrors.push(String(error));
        }
    }

    private injectionParams(): AppInjectionParams {
        const ios = this.options.platform === 'ios';
        return {
            // A notched iPhone and a gesture-navigation Android phone — plausible values, not measured ones.
            insets: this.options.insets ?? (ios ? IPHONE_INSETS : ANDROID_INSETS),
            keyboardHeight: 0,
            theme: 'light',
            configBag: { 'ui.onboardingCompleted': 'true', ...this.options.configBag },
            deviceInfo: {
                runId: 'e2e-run',
                platform: this.options.platform,
                applicationName: 'DoU E2E',
                stage: 'local',
                consoleEnabled: false,
                uniqueId: 'e2e-device:e2e-install',
                deviceModel: ios ? 'iPhone17,1' : 'Pixel 7',
                osVersion: ios ? '26.0' : '15',
                appVersion: '0.28.1',
                buildNumber: '1',
                appLanguage: 'en',
                installationId: 'e2e-device',
                uniqueDeviceId: 'e2e-device',
                firebaseInstallationId: '',
                latestVersion: '0.28.1',
                shouldUpdate: false,
            },
        };
    }
}

/**
 * Answers every app build gives at boot, so a scenario starts from an app that is up to date and
 * has nothing pending. A scenario overrides what it is about.
 *
 * What is left out answers `NOT_FOUND`, which the web reads as an app built before that message —
 * the photo grid (`ListPhotos`), file transfers, push tokens, the per-channel chat preview. Each has a
 * fallback in the web for exactly that app, and a scenario that needs the message adds its handler.
 */
const defaultHandlers = (platform: ShellPlatform): ShellHandlerTable => ({
    // Posted and never read back: the real handlers answer nothing.
    SendLog: () => undefined,
    SetDebugMode: () => undefined,
    SetBadgeCount: () => undefined,
    SetCanGoBack: () => undefined,
    FirstScreenReady: () => undefined,
    SendBootMetrics: () => undefined,
    StartPerfTrace: () => undefined,
    StopPerfTrace: () => undefined,
    CheckAppUpdate: () => ({
        platform,
        currentVersion: '0.28.1',
        latestVersion: '0.28.1',
        updateAvailable: false,
        storeUrl: '',
    }),
    FetchPreference: data => ({ key: data.key, value: null }),
    FetchBadgeBase: () => ({ base: 0 }),
    FetchPushMarks: () => ({ marks: [] }),
    FetchPendingReports: () => ({ reports: [] }),
});
