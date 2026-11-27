import type { HostOs } from '@chatic/ports';

import { mobileShellAppShell } from './appShell';
import type { ShellBridge } from './bridge';

const bridge = { post: jest.fn(), request: jest.fn(), onEvent: jest.fn(() => () => undefined) };

const phone = (os: HostOs = 'ios') => mobileShellAppShell(bridge as unknown as ShellBridge)({ kind: 'shell', os });

beforeEach(() => jest.resetAllMocks());

describe('mobileShellAppShell — the phone app', () => {
    it('owns its window and reports the keyboard, and has none of the desktop app’s members', () => {
        expect(phone()).toMatchObject({
            kind: 'shell',
            os: 'ios',
            ownsWindow: true,
            reportsKeyboardHeight: true,
            dockBadge: null,
            selfUpdate: null,
        });
    });

    it('plays a haptic as a one-way post', () => {
        phone().haptics?.play('impact');

        expect(bridge.post).toHaveBeenCalledWith({ type: 'TriggerHaptic', data: { kind: 'impact' } });
        expect(bridge.request).not.toHaveBeenCalled();
    });

    it('saves a preference with confirmation, and passes a refusal on for the caller to retry', async () => {
        bridge.request.mockResolvedValueOnce({ success: true });
        await expect(phone().preferences?.save('theme', 'dark')).resolves.toBeUndefined();
        expect(bridge.request).toHaveBeenCalledWith({ type: 'SavePreference', data: { key: 'theme', value: 'dark' } });
        expect(bridge.request.mock.calls[0]).toHaveLength(1);

        bridge.request.mockRejectedValueOnce(new Error('dropped'));
        await expect(phone().preferences?.save('language', 'ko')).rejects.toThrow('dropped');
    });

    it('reads the value the shell holds under a preference key', async () => {
        bridge.request.mockResolvedValue({ data: { key: 'theme', value: 'dark' } });

        await expect(phone().preferences?.read('theme')).resolves.toBe('dark');
        expect(bridge.request).toHaveBeenCalledWith({ type: 'FetchPreference', data: { key: 'theme' } });
        expect(bridge.request.mock.calls[0]).toHaveLength(1);
    });

    it('tells the shell whether back is the page’s to spend', () => {
        phone().backGesture?.setCanGoBack(true);

        expect(bridge.post).toHaveBeenCalledWith({
            type: 'SetCanGoBack',
            data: { canGoBack: true, includesHistory: true },
        });
    });

    it('checks the store, answering only whether an update is there and which version', async () => {
        bridge.request.mockResolvedValue({
            success: true,
            data: {
                platform: 'ios',
                currentVersion: '1.0.0',
                latestVersion: '1.4.0',
                updateAvailable: true,
                storeUrl: 'x',
            },
        });

        await expect(phone().storeUpdate?.check()).resolves.toEqual({ updateAvailable: true, latestVersion: '1.4.0' });
        expect(bridge.request).toHaveBeenCalledWith({ type: 'CheckAppUpdate', data: {} });
        expect(bridge.request.mock.calls[0]).toHaveLength(1);
    });

    it('passes a failed store check on, so the caller keeps the last status', async () => {
        bridge.request.mockRejectedValue(new Error('NATIVE_NOT_SUPPORTED'));

        await expect(phone().storeUpdate?.check()).rejects.toThrow('NATIVE_NOT_SUPPORTED');
    });

    it('opens its own store listing', () => {
        phone().storeUpdate?.openStore();

        expect(bridge.post).toHaveBeenCalledTimes(1);
        expect(bridge.post).toHaveBeenCalledWith({ type: 'OpenStore', data: {} });
    });

    it('opens its own page in the OS settings', () => {
        phone().systemSettings?.open();

        expect(bridge.post).toHaveBeenCalledTimes(1);
        expect(bridge.post).toHaveBeenCalledWith({ type: 'OpenSettings', data: {} });
    });
});

describe('mobileShellAppShell — the phone app’s icon badge', () => {
    describe('iOS', () => {
        it('reads the live icon badge, never the shared counter', async () => {
            bridge.request.mockResolvedValue({ success: true, data: { count: 4 } });

            await expect(phone('ios').iconBadge?.read()).resolves.toBe(4);
            expect(bridge.request).toHaveBeenCalledTimes(1);
            expect(bridge.request).toHaveBeenCalledWith({ type: 'FetchBadgeCount', data: {} });
            expect(bridge.request.mock.calls[0]).toHaveLength(1);
        });

        it('is null, not 0, when the read fails', async () => {
            bridge.request.mockRejectedValue(new Error('timeout'));

            await expect(phone('ios').iconBadge?.read()).resolves.toBeNull();
        });

        it('is null when the shell answers success: false', async () => {
            bridge.request.mockResolvedValue({ success: false });

            await expect(phone('ios').iconBadge?.read()).resolves.toBeNull();
        });
    });

    describe('Android', () => {
        it('reads the shared counter, never notifee’s badge', async () => {
            bridge.request.mockResolvedValue({ success: true, data: { base: 6 } });

            await expect(phone('android').iconBadge?.read()).resolves.toBe(6);
            expect(bridge.request).toHaveBeenCalledTimes(1);
            expect(bridge.request).toHaveBeenCalledWith({ type: 'FetchBadgeBase', data: {} });
            expect(bridge.request.mock.calls[0]).toHaveLength(1);
        });

        it('is null when the shell says it cannot answer (base: null)', async () => {
            bridge.request.mockResolvedValue({ success: true, data: { base: null } });

            await expect(phone('android').iconBadge?.read()).resolves.toBeNull();
        });

        it('is null when the shell answers success: false', async () => {
            bridge.request.mockResolvedValue({ success: false, error: { code: 'BADGE_ERROR' } });

            await expect(phone('android').iconBadge?.read()).resolves.toBeNull();
        });

        it('asks again after a failed read', async () => {
            bridge.request
                .mockRejectedValueOnce(new Error('timeout'))
                .mockResolvedValueOnce({ success: true, data: { base: 2 } });
            const badge = phone('android').iconBadge;

            await expect(badge?.read()).resolves.toBeNull();
            await expect(badge?.read()).resolves.toBe(2);
        });
    });
});

describe('mobileShellAppShell — the phone app’s alternate icons', () => {
    it('reads the icon in use and whether it can change', async () => {
        bridge.request.mockResolvedValue({ success: true, data: { iconName: 'alt', supported: true } });

        await expect(phone().appIcon?.current()).resolves.toEqual({ iconName: 'alt', supported: true });
        expect(bridge.request).toHaveBeenCalledWith({ type: 'FetchAppIcon', data: {} });
        expect(bridge.request.mock.calls[0]).toHaveLength(1);
    });

    it('lists the icons on offer', async () => {
        bridge.request.mockResolvedValue({ success: true, data: { availableIcons: [{ id: 'alt', label: 'Alt' }] } });

        await expect(phone().appIcon?.options()).resolves.toEqual([{ id: 'alt', label: 'Alt' }]);
        expect(bridge.request).toHaveBeenCalledWith({ type: 'FetchAppIconList', data: {} });
        expect(bridge.request.mock.calls[0]).toHaveLength(1);
    });

    it('answers null for a status or list the app did not give', async () => {
        bridge.request.mockResolvedValue({ success: false });

        await expect(phone().appIcon?.current()).resolves.toBeNull();
        await expect(phone().appIcon?.options()).resolves.toBeNull();
    });

    it('answers the icon the app applied, or null when it did not change', async () => {
        bridge.request.mockResolvedValueOnce({ success: true, data: { success: true, iconName: 'MidnightIcon' } });
        await expect(phone().appIcon?.change('MidnightIcon')).resolves.toEqual({ iconName: 'MidnightIcon' });
        expect(bridge.request).toHaveBeenCalledWith({ type: 'ChangeAppIcon', data: { iconName: 'MidnightIcon' } });
        expect(bridge.request.mock.calls[0]).toHaveLength(1);

        bridge.request.mockResolvedValueOnce({ success: true, data: { success: false } });
        await expect(phone().appIcon?.change(null)).resolves.toBeNull();
    });
});
