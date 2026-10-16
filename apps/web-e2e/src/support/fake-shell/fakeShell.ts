import type { Page } from '@playwright/test';

import {
    bootHandlers,
    dispatchTarget,
    FAKE_SHELL_APP_VERSION,
    FAKE_SHELL_CACHE_TYPES,
    MemoryCache,
    ShellCore,
    type AppInjectionParams,
    type ShellHandler,
    type ShellHandlerTable,
    type ShellPlatform,
} from '@chatic/fake-shell';
import type { AppMessageDataMap, AppMessageType, WebMessageData, WebMessageType } from '@chatic/app-messages';

import { loadAppInjection } from './appInjection';

export type { ShellPlatform } from '@chatic/fake-shell';

export interface FakeShellOptions {
    platform: ShellPlatform;
    /** `@chatic/config`'s shell lane, as the app injects it. Onboarding is done unless a test says otherwise. */
    configBag?: Record<string, string>;
    insets?: { top: number; bottom: number; left: number; right: number };
}

/**
 * The shell lane a scenario starts from: onboarding already done, and the debug overlay off. The suite
 * builds with `VITE_ENV=LOCAL`, whose stage rule turns that overlay on, and its floating button sits
 * over the composer's Send button. A shell-lane value outranks the stage rule, so this puts the page
 * back to what a user has. The real app never writes this key there — its own debug toggle writes the
 * local lane, which outranks the stage rule the same way.
 */
const DEFAULT_CONFIG_BAG: Record<string, string> = {
    'ui.onboardingCompleted': 'true',
    'debug.overlayEnabled': 'false',
};

const IPHONE_INSETS = { top: 59, bottom: 34, left: 0, right: 0 };
const ANDROID_INSETS = { top: 24, bottom: 0, left: 0, right: 0 };

/** The name the page calls to hand a message to this process. Never part of the app's own API. */
const POST_BINDING = '__e2eFakeShellPost';

/**
 * A native shell for the web app, in the test process.
 *
 * The page gets what react-native-webview gives it: `window.ReactNativeWebView.postMessage` is present
 * before any page script runs (the web polls for it from module scope, so it must already be there),
 * and the app's own injection script then runs on top of it. The shell itself — the mobile app's own
 * `AppBridgeHost` with a typed handler table — is `@chatic/fake-shell`'s `ShellCore`, shared with the
 * virtual shell; what is here is the Playwright transport: the page's posts arrive through
 * `page.exposeFunction`, and a reply goes back as the WebView delivers it — a JSON string dispatched as
 * a `message` event.
 */
export class FakeShell {
    readonly cache = new MemoryCache();
    private readonly core: ShellCore;

    private constructor(
        private readonly page: Page,
        private readonly options: FakeShellOptions
    ) {
        this.core = new ShellCore({
            transport: { deliver: raw => this.deliver(raw) },
            supportedCacheTypes: [...FAKE_SHELL_CACHE_TYPES],
        });
        this.use(this.cache.handlers());
        this.use(bootHandlers(options.platform));
    }

    static async install(page: Page, options: FakeShellOptions): Promise<FakeShell> {
        const shell = new FakeShell(page, options);
        const injection = shell.injectionParams();
        const getSyncInjectionScript = await loadAppInjection();
        await page.exposeFunction(POST_BINDING, (raw: string) => shell.core.receive(raw));
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

    /** Requests the host answered `NOT_FOUND` — as an app build without that handler would. */
    get unhandled(): string[] {
        return this.core.unhandled;
    }

    /** Failures the app's injection script reported about itself; see `ShellCore.injectionErrors`. */
    get injectionErrors(): string[] {
        return this.core.injectionErrors;
    }

    /** Replies that could not be dispatched into the page for a reason other than it going away. */
    get deliveryErrors(): string[] {
        return this.core.deliveryErrors;
    }

    /** Adds or replaces handlers. A test changes the shell's answer by registering over the default. */
    use(handlers: ShellHandlerTable): void {
        this.core.use(handlers);
    }

    handle<K extends WebMessageType>(type: K, handler: ShellHandler<K>): void {
        this.core.handle(type, handler);
    }

    /** Pushes an app → web event, as the app does for a push tap or a resume. */
    push<K extends AppMessageType>(type: K, data: AppMessageDataMap[K]): void {
        this.core.push(type, data);
    }

    /** See `ShellCore.delivered`. */
    delivered(type: AppMessageType, options?: { timeout?: number }): Promise<void> {
        return this.core.delivered(type, options);
    }

    /** Every message the page has sent so far, oldest first. */
    received<K extends WebMessageType>(type: K): WebMessageData<K>[] {
        return this.core.received(type);
    }

    /** See `ShellCore.waitFor`. */
    waitFor<K extends WebMessageType>(
        type: K,
        predicate?: (message: WebMessageData<K>) => boolean,
        options?: { timeout?: number }
    ): Promise<WebMessageData<K>> {
        return this.core.waitFor(type, predicate, options);
    }

    private async deliver(raw: string): Promise<boolean> {
        try {
            await this.page.evaluate(
                ({ data, on }) =>
                    (on === 'window' ? window : document).dispatchEvent(new MessageEvent('message', { data })),
                { data: raw, on: dispatchTarget(this.options.platform) }
            );
            return true;
        } catch (error) {
            // The page navigated or closed between request and reply: dropped, as the real shell does.
            if (this.page.isClosed() || /Execution context was destroyed|has been closed/.test(String(error))) {
                return false;
            }
            throw error;
        }
    }

    private injectionParams(): AppInjectionParams {
        const ios = this.options.platform === 'ios';
        return {
            // A notched iPhone and a gesture-navigation Android phone — plausible values, not measured ones.
            insets: this.options.insets ?? (ios ? IPHONE_INSETS : ANDROID_INSETS),
            keyboardHeight: 0,
            theme: 'light',
            configBag: { ...DEFAULT_CONFIG_BAG, ...this.options.configBag },
            deviceInfo: {
                runId: 'e2e-run',
                platform: this.options.platform,
                applicationName: 'DoU E2E',
                stage: 'local',
                consoleEnabled: false,
                uniqueId: 'e2e-device:e2e-install',
                deviceModel: ios ? 'iPhone17,1' : 'Pixel 7',
                osVersion: ios ? '26.0' : '15',
                appVersion: FAKE_SHELL_APP_VERSION,
                buildNumber: '1',
                appLanguage: 'en',
                installationId: 'e2e-device',
                uniqueDeviceId: 'e2e-device',
                firebaseInstallationId: '',
                latestVersion: FAKE_SHELL_APP_VERSION,
                shouldUpdate: false,
            },
        };
    }
}
