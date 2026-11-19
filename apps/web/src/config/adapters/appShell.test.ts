import type { WebHostFacts } from '@chatic/runtime-web';

import { appBridge } from '../../app/bridge/appBridge';
import { webAppShell } from './appShell';

const mockRequest = jest.fn();
jest.mock('@chatic/bridges', () => ({
    ...jest.requireActual('@chatic/bridges'),
    webClient: { request: (...args: unknown[]) => mockRequest(...args) },
}));
jest.mock('../../app/bridge/appBridge', () => ({
    appBridge: {
        postHaptic: jest.fn(),
        savePreferenceConfirmed: jest.fn(),
        fetchPreference: jest.fn(),
        setCanGoBack: jest.fn(),
        fetchBadgeCount: jest.fn(),
        fetchBadgeBase: jest.fn(),
        checkAppUpdate: jest.fn(),
        openStore: jest.fn(),
    },
}));

const bridge = appBridge as unknown as Record<keyof typeof appBridge, jest.Mock>;

// Neither side reads the facts; the shell's side reads the phone platform from `base.os`.
const facts = {} as WebHostFacts;
const phone = (os: 'ios' | 'android' | null = 'ios') => webAppShell.shell({ kind: 'shell', os }, facts);
const browser = () => webAppShell.browser({ kind: 'browser', os: null }, facts);

beforeEach(() => jest.clearAllMocks());

describe('webAppShell — the phone app', () => {
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

        expect(bridge.postHaptic).toHaveBeenCalledWith('impact');
    });

    it('saves a preference with confirmation, and passes a refusal on for the caller to retry', async () => {
        bridge.savePreferenceConfirmed.mockResolvedValueOnce({ success: true });
        await expect(phone().preferences?.save('theme', 'dark')).resolves.toBeUndefined();
        expect(bridge.savePreferenceConfirmed).toHaveBeenCalledWith({ key: 'theme', value: 'dark' });

        bridge.savePreferenceConfirmed.mockRejectedValueOnce(new Error('dropped'));
        await expect(phone().preferences?.save('language', 'ko')).rejects.toThrow('dropped');
    });

    it('reads the value the shell holds under a preference key', async () => {
        bridge.fetchPreference.mockResolvedValue({ data: { key: 'theme', value: 'dark' } });

        await expect(phone().preferences?.read('theme')).resolves.toBe('dark');
        expect(bridge.fetchPreference).toHaveBeenCalledWith({ key: 'theme' });
    });

    it('tells the shell whether back is the page’s to spend', () => {
        phone().backGesture?.setCanGoBack(true);

        expect(bridge.setCanGoBack).toHaveBeenCalledWith(true);
    });

    it('checks the store, answering only whether an update is there and which version', async () => {
        bridge.checkAppUpdate.mockResolvedValue({
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
    });

    it('passes a failed store check on, so the caller keeps the last status', async () => {
        bridge.checkAppUpdate.mockRejectedValue(new Error('NATIVE_NOT_SUPPORTED'));

        await expect(phone().storeUpdate?.check()).rejects.toThrow('NATIVE_NOT_SUPPORTED');
    });

    it('opens its own store listing', () => {
        phone().storeUpdate?.openStore();

        expect(bridge.openStore).toHaveBeenCalledTimes(1);
    });
});

describe('webAppShell — the phone app’s icon badge', () => {
    describe('iOS', () => {
        it('reads the live icon badge, never the shared counter', async () => {
            bridge.fetchBadgeCount.mockResolvedValue({ success: true, data: { count: 4 } });

            await expect(phone('ios').iconBadge?.read()).resolves.toBe(4);
            expect(bridge.fetchBadgeBase).not.toHaveBeenCalled();
        });

        it('is null, not 0, when the read fails', async () => {
            bridge.fetchBadgeCount.mockRejectedValue(new Error('timeout'));

            await expect(phone('ios').iconBadge?.read()).resolves.toBeNull();
        });

        it('is null when the shell answers success: false', async () => {
            bridge.fetchBadgeCount.mockResolvedValue({ success: false });

            await expect(phone('ios').iconBadge?.read()).resolves.toBeNull();
        });
    });

    describe('Android', () => {
        // notifee's badge API is iOS-only, so on Android the real value lives only in the shared counter.
        it('reads the shared counter, never notifee’s badge', async () => {
            bridge.fetchBadgeBase.mockResolvedValue({ success: true, data: { base: 6 } });

            await expect(phone('android').iconBadge?.read()).resolves.toBe(6);
            expect(bridge.fetchBadgeCount).not.toHaveBeenCalled();
        });

        it('is null when the shell says it cannot answer (base: null)', async () => {
            bridge.fetchBadgeBase.mockResolvedValue({ success: true, data: { base: null } });

            await expect(phone('android').iconBadge?.read()).resolves.toBeNull();
        });

        // The web ships ahead of the app, so some shells do not know this message; the facade hands
        // back the raw response, so a refusal can arrive as success: false rather than a rejection.
        it('is null when the shell answers success: false', async () => {
            bridge.fetchBadgeBase.mockResolvedValue({ success: false, error: { code: 'BADGE_ERROR' } });

            await expect(phone('android').iconBadge?.read()).resolves.toBeNull();
        });

        it('asks again after a failed read', async () => {
            bridge.fetchBadgeBase
                .mockRejectedValueOnce(new Error('timeout'))
                .mockResolvedValueOnce({ success: true, data: { base: 2 } });
            const badge = phone('android').iconBadge;

            await expect(badge?.read()).resolves.toBeNull();
            await expect(badge?.read()).resolves.toBe(2);
        });
    });
});

describe('webAppShell — the phone app’s alternate icons', () => {
    it('reads the icon in use and whether it can change', async () => {
        mockRequest.mockResolvedValue({ success: true, data: { iconName: 'alt', supported: true } });

        await expect(phone().appIcon?.current()).resolves.toEqual({ iconName: 'alt', supported: true });
        expect(mockRequest).toHaveBeenCalledWith({ type: 'FetchAppIcon', data: {} });
    });

    it('lists the icons on offer', async () => {
        mockRequest.mockResolvedValue({ success: true, data: { availableIcons: [{ id: 'alt', label: 'Alt' }] } });

        await expect(phone().appIcon?.options()).resolves.toEqual([{ id: 'alt', label: 'Alt' }]);
        expect(mockRequest).toHaveBeenCalledWith({ type: 'FetchAppIconList', data: {} });
    });

    it('answers null for a status or list the app did not give', async () => {
        mockRequest.mockResolvedValue({ success: false });

        await expect(phone().appIcon?.current()).resolves.toBeNull();
        await expect(phone().appIcon?.options()).resolves.toBeNull();
    });

    it('answers the icon the app applied, or null when it did not change', async () => {
        mockRequest.mockResolvedValueOnce({ success: true, data: { success: true, iconName: 'MidnightIcon' } });
        await expect(phone().appIcon?.change('MidnightIcon')).resolves.toEqual({ iconName: 'MidnightIcon' });
        expect(mockRequest).toHaveBeenCalledWith({ type: 'ChangeAppIcon', data: { iconName: 'MidnightIcon' } });

        mockRequest.mockResolvedValueOnce({ success: true, data: { success: false } });
        await expect(phone().appIcon?.change(null)).resolves.toBeNull();
    });
});

describe('webAppShell — a browser tab', () => {
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
        });
    });
});
