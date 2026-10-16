import type { ShellPlatform } from '@chatic/fake-shell';

import type { LogEntry, LogFilter } from './logStore';
import type { LaunchMode, PushNotificationInput, VirtualShell } from './VirtualShell';

/**
 * `window.virtualShell`: the panel's tools, for an agent driving the page through a browser tool's
 * script execution. Each entry calls the same method the panel's button does, recorded as `api`.
 * Everything returns JSON-serialisable values, so the result of an evaluated expression reads as is.
 */
export const createShellApi = (shell: VirtualShell) => {
    const logs = Object.assign((filter?: LogFilter): LogEntry[] => shell.readLogs(filter), {
        clear: (): void => shell.clearLogs(),
    });
    return {
        status: () => shell.status(),
        logs,
        push: {
            receive: (notification: PushNotificationInput) => shell.pushReceive(notification, 'api'),
            tap: (data: Record<string, unknown>, opts?: { launch?: LaunchMode }) => shell.pushTap(data, opts, 'api'),
        },
        deeplink: (url: string, opts?: { launch?: LaunchMode }) => shell.deeplink(url, opts, 'api'),
        app: {
            background: () => shell.appBackground('api'),
            foreground: () => shell.appForeground('api'),
            restart: (opts?: { clearCache?: boolean }) => shell.restart(opts, 'api'),
        },
        back: () => shell.back('api'),
        device: {
            set: (input: { preset?: string; platform?: ShellPlatform; theme?: 'light' | 'dark' }) =>
                shell.deviceSet(input, 'api'),
            list: () => shell.deviceList(),
        },
        waitFor: (type: string, opts?: { source?: 'web→shell' | 'shell→web'; since?: number; timeout?: number }) =>
            shell.waitFor(type, opts),
        keyboard: {
            show: (height?: number) => shell.keyboardShow(height, 'api'),
            hide: () => shell.keyboardHide('api'),
        },
        storage: () => shell.storageView(),
        events: {
            push: (type: string, data: unknown) => shell.eventsPush(type, data, 'api'),
            types: () => shell.eventTypes(),
        },
    };
};

export type ShellApi = ReturnType<typeof createShellApi>;
