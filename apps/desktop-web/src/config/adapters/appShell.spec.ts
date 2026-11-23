import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WebHostFacts } from '@chatic/runtime-web';

const { request, post, onEvent, events } = vi.hoisted(() => {
    const events: Record<string, (message: unknown) => void> = {};
    return {
        events,
        request: vi.fn(async () => ({ success: true, data: { success: true } })),
        post: vi.fn(),
        onEvent: vi.fn((type: string, handler: (message: unknown) => void) => {
            events[type] = handler;
            return () => delete events[type];
        }),
    };
});
vi.mock('@chatic/bridges', () => ({ webClient: { request, post, onEvent } }));

import { desktopAppShell } from './appShell';

const facts = {} as WebHostFacts;
const shell = () => desktopAppShell.shell({ kind: 'shell', os: null }, facts);
const browser = () => desktopAppShell.browser({ kind: 'browser', os: null }, facts);

beforeEach(() => vi.clearAllMocks());

describe('desktopAppShell — the desktop app', () => {
    it('owns its window, and has none of the phone app’s members', () => {
        expect(shell()).toMatchObject({
            kind: 'shell',
            os: null,
            ownsWindow: true,
            reportsKeyboardHeight: false,
            haptics: null,
            preferences: null,
            backGesture: null,
            iconBadge: null,
            appIcon: null,
            storeUpdate: null,
            systemSettings: null,
        });
    });

    it('paints the dock badge through SetBadgeCount, with the overlay PNG Windows needs', async () => {
        await expect(shell().dockBadge?.set(3, 'data:image/png;base64,AA')).resolves.toEqual({
            success: true,
            data: { success: true },
        });

        expect(request).toHaveBeenCalledWith({
            type: 'SetBadgeCount',
            data: { count: 3, overlayIconDataUrl: 'data:image/png;base64,AA' },
        });
    });

    it('passes each update status the shell announces, skipping an empty one, until unsubscribed', () => {
        const listener = vi.fn();
        const unsubscribe = shell().selfUpdate?.onStatus(listener);

        expect(onEvent).toHaveBeenCalledWith('OnUpdateStatus', expect.any(Function));
        events['OnUpdateStatus']?.({ data: { status: 'downloading', version: '1.2.0', percent: 40 } });
        events['OnUpdateStatus']?.({});
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith({ status: 'downloading', version: '1.2.0', percent: 40 });

        unsubscribe?.();
        expect(events['OnUpdateStatus']).toBeUndefined();
    });

    it('asks the shell to download, then to restart, as one-object posts', () => {
        const selfUpdate = shell().selfUpdate;
        selfUpdate?.startDownload();
        selfUpdate?.restart();

        expect(post).toHaveBeenNthCalledWith(1, { type: 'StartUpdateDownload', data: {} });
        expect(post).toHaveBeenNthCalledWith(2, { type: 'RestartToUpdate', data: {} });
    });
});

describe('desktopAppShell — a browser tab', () => {
    it('is the person’s tab, with no frame members at all', () => {
        expect(browser()).toEqual({
            kind: 'browser',
            os: null,
            ownsWindow: false,
            reportsKeyboardHeight: false,
            haptics: null,
            preferences: null,
            backGesture: null,
            iconBadge: null,
            dockBadge: null,
            appIcon: null,
            storeUpdate: null,
            selfUpdate: null,
            systemSettings: null,
        });
        expect(request).not.toHaveBeenCalled();
        expect(onEvent).not.toHaveBeenCalled();
    });
});
