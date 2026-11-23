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
import type { AppMessageDataMap, AppMessageType, WebMessageData, WebMessageType } from '@chatic/bridge-messages';

import { loadAppInjection } from './appInjection';

export type { ShellPlatform } from '@chatic/fake-shell';

export interface FakeShellOptions {
    platform: ShellPlatform;
    configBag?: Record<string, string>;
    insets?: { top: number; bottom: number; left: number; right: number };
    appVersion?: string;
    capabilities?: AppInjectionParams['capabilities'] | null;
}

const DEFAULT_CONFIG_BAG: Record<string, string> = {
    'ui.onboardingCompleted': 'true',
    'debug.overlayEnabled': 'false',
};

const IPHONE_INSETS = { top: 59, bottom: 34, left: 0, right: 0 };
const ANDROID_INSETS = { top: 24, bottom: 0, left: 0, right: 0 };

const POST_BINDING = '__e2eFakeShellPost';

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
                if (window.top !== window) return;
                const post = (window as unknown as Record<string, (raw: string) => void>)[binding];
                (window as unknown as { ReactNativeWebView: unknown }).ReactNativeWebView = {
                    postMessage: (raw: string) => post(String(raw)),
                };
                const inject = () => (0, eval)(injection);
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

    get unhandled(): string[] {
        return this.core.unhandled;
    }

    get injectionErrors(): string[] {
        return this.core.injectionErrors;
    }

    get deliveryErrors(): string[] {
        return this.core.deliveryErrors;
    }

    use(handlers: ShellHandlerTable): void {
        this.core.use(handlers);
    }

    handle<K extends WebMessageType>(type: K, handler: ShellHandler<K>): void {
        this.core.handle(type, handler);
    }

    push<K extends AppMessageType>(type: K, data: AppMessageDataMap[K]): void {
        this.core.push(type, data);
    }

    delivered(type: AppMessageType, options?: { timeout?: number }): Promise<void> {
        return this.core.delivered(type, options);
    }

    received<K extends WebMessageType>(type: K): WebMessageData<K>[] {
        return this.core.received(type);
    }

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
            if (this.page.isClosed() || /Execution context was destroyed|has been closed/.test(String(error))) {
                return false;
            }
            throw error;
        }
    }

    private injectionParams(): AppInjectionParams {
        const ios = this.options.platform === 'ios';
        return {
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
                appVersion: this.options.appVersion ?? FAKE_SHELL_APP_VERSION,
                buildNumber: '1',
                appLanguage: 'en',
                installationId: 'e2e-device',
                uniqueDeviceId: 'e2e-device',
                firebaseInstallationId: '',
                latestVersion: FAKE_SHELL_APP_VERSION,
                shouldUpdate: false,
            },
            ...(this.options.capabilities !== null && {
                capabilities: this.options.capabilities ?? {
                    version: 4,
                    checkout: [ios ? 'apple' : 'google'],
                    media: 'shell',
                    files: 'shell',
                    links: 'shell',
                    appShell: 'shell',
                    signIn: 'shell',
                    diagnostics: 'shell',
                    push: 'shell',
                },
            }),
        };
    }
}
