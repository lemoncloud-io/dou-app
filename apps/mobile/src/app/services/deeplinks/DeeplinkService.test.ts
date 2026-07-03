import { Linking } from 'react-native';
import { DeeplinkService } from './DeeplinkService';
import type { ILogService } from '../log';
import type { DeepLinkManager } from './DeepLinkManager';
import { getRouteStateFromDeepLinkPath } from './deeplinkUtils';

// Mock react-native
jest.mock('react-native', () => ({
    Linking: {
        canOpenURL: jest.fn().mockResolvedValue(true),
        openURL: jest.fn().mockResolvedValue(true),
        getInitialURL: jest.fn().mockResolvedValue(null),
        addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    },
    NativeModules: {
        InitialUrlModule: {
            getInitialUniversalLink: jest.fn().mockResolvedValue(null),
        },
    },
    Platform: {
        OS: 'ios',
    },
}));

// Mock react-native-config
jest.mock('react-native-config', () => ({
    default: {
        VITE_ENV: 'DEV',
    },
}));

// Dummy logger
const dummyLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
} as unknown as ILogService;

const dummyManager = {
    getInitialUrl: jest.fn(),
    subscribe: jest.fn(),
    waitForColdStart: jest.fn(),
} as unknown as DeepLinkManager;

describe('DeeplinkService', () => {
    let service: DeeplinkService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new DeeplinkService(dummyManager, dummyLogger);
    });

    it('should normalize and route relative path URLs to custom scheme (dev mode)', async () => {
        await service.handleUrl('/auth/login?code=123');

        expect(Linking.canOpenURL).toHaveBeenCalledWith('chatic-dev://auth/login?code=123');
        expect(Linking.openURL).toHaveBeenCalledWith('chatic-dev://auth/login?code=123');
    });

    it('should open full scheme URLs directly without modification', async () => {
        await service.handleUrl('chatic://s?code=invt:910001:3f9a8b&api=vjgudphpo4');

        expect(Linking.canOpenURL).toHaveBeenCalledWith('chatic://s?code=invt:910001:3f9a8b&api=vjgudphpo4');
        expect(Linking.openURL).toHaveBeenCalledWith('chatic://s?code=invt:910001:3f9a8b&api=vjgudphpo4');
    });

    it('should skip empty URLs gracefully', async () => {
        await service.handleUrl('');
        expect(Linking.canOpenURL).not.toHaveBeenCalled();
        expect(Linking.openURL).not.toHaveBeenCalled();
    });

    it('should log an error if scheme is not supported', async () => {
        (Linking.canOpenURL as jest.Mock).mockResolvedValueOnce(false);

        await service.handleUrl('unsupported://xyz');

        expect(Linking.canOpenURL).toHaveBeenCalledWith('unsupported://xyz');
        expect(Linking.openURL).not.toHaveBeenCalled();
        expect(dummyLogger.error).toHaveBeenCalledWith(
            'DEEPLINK',
            expect.stringContaining('URL scheme is not supported')
        );
    });
});

describe('getRouteStateFromDeepLinkPath', () => {
    it('should default to WebView MainScreen routing for standard deep links', () => {
        const state = getRouteStateFromDeepLinkPath('chatic://s?code=invt:910001:test&api=dev');
        expect(state).toBeDefined();
        expect(state.routes[0].name).toBe('Main');
        expect(state.routes[0].state.routes[0].name).toBe('Main');
        // Invite links now resolve to the home route (not /auth/login) with the invite marker.
        expect(state.routes[0].state.routes[0].params.url).toContain('/?code=invt%3A910001%3Atest');
        expect(state.routes[0].state.routes[0].params.url).toContain('provider=invite');
        expect(state.routes[0].state.routes[0].params.url).not.toContain('/auth/login');
    });

    it('should route natively to Debug screens when target=native is specified', () => {
        const state = getRouteStateFromDeepLinkPath('chatic://debug/DeeplinkTest?target=native&param1=hello');
        expect(state).toBeDefined();
        expect(state.routes[0].name).toBe('Debug');
        expect(state.routes[0].state.routes[0].name).toBe('DeeplinkTest');
        expect(state.routes[0].state.routes[0].params).toEqual({ param1: 'hello' });
    });

    it('should fallback to Home screen for unknown debug screens when target=native', () => {
        const state = getRouteStateFromDeepLinkPath('chatic://debug/UnknownScreen?target=native');
        expect(state).toBeDefined();
        expect(state.routes[0].name).toBe('Debug');
        expect(state.routes[0].state.routes[0].name).toBe('Home');
    });

    it('should route natively to Modal in Main stack when specified', () => {
        const state = getRouteStateFromDeepLinkPath('chatic://main/modal?target=native&url=https://chatic.io');
        expect(state).toBeDefined();
        expect(state.routes[0].name).toBe('Main');
        expect(state.routes[0].state.routes[0].name).toBe('Modal');
        expect(state.routes[0].state.routes[0].params).toEqual({ url: 'https://chatic.io' });
    });

    it('should pass custom scheme URLs through unchanged (toLocalUrl normalizes host at consumption)', () => {
        // Host rewriting moved to toLocalUrl; the route param now carries the raw scheme URL so the
        // WebView layer resolves it against WEBVIEW_URL. This removes the duplicated domain heuristic.
        const state = getRouteStateFromDeepLinkPath('chatic-dev://auth/login?code=123');
        expect(state).toBeDefined();
        expect(state.routes[0].name).toBe('Main');
        expect(state.routes[0].state.routes[0].name).toBe('Main');
        expect(state.routes[0].state.routes[0].params.url).toBe('chatic-dev://auth/login?code=123');
    });

    it('should fallback to MainScreen for completely unknown native routes when target=native', () => {
        const state = getRouteStateFromDeepLinkPath('chatic://completelyUnknownRoute?target=native');
        expect(state).toBeDefined();
        expect(state.routes[0].name).toBe('Main');
        expect(state.routes[0].state.routes[0].name).toBe('Main');
        expect(state.routes[0].state.routes[0].params).toBeUndefined();
    });

    it('should correctly parse leading-slash paths passed by React Navigation on warm start', () => {
        const state = getRouteStateFromDeepLinkPath('/s?code=invt:910001:test&api=dev');
        expect(state).toBeDefined();
        expect(state.routes[0].name).toBe('Main');
        expect(state.routes[0].state.routes[0].name).toBe('Main');
        // Invite links now resolve to the home route (not /auth/login) with the invite marker.
        expect(state.routes[0].state.routes[0].params.url).toContain('/?code=invt%3A910001%3Atest');
        expect(state.routes[0].state.routes[0].params.url).toContain('provider=invite');
        expect(state.routes[0].state.routes[0].params.url).not.toContain('/auth/login');
    });
});
