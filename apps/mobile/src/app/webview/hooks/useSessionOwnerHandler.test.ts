import { renderHook } from '@testing-library/react';

import { useSessionOwnerHandler } from './useSessionOwnerHandler';

let mockStage: string | undefined;
jest.mock('react-native-config', () => ({
    __esModule: true,
    default: {
        get VITE_ENV() {
            return mockStage;
        },
    },
}));

const mockRestart = jest.fn();
jest.mock('../../services/appRestart', () => ({
    appRestart: { restart: (...args: unknown[]) => mockRestart(...args) },
}));

let mockBuildDefault: 'web' | 'native' = 'web';
jest.mock('../../services/runtime/launchSessionOwner', () => {
    const { readDefaultSessionOwner } = jest.requireActual('../../services/runtime/sessionOwner');
    return {
        launchSessionOwner: () => 'web',
        unswitchedSessionOwner: (file: any) => readDefaultSessionOwner(file) ?? mockBuildDefault,
    };
});

const mockEntries = new Map<string, string>();
jest.mock('../../services/runtime/runtimeStorageFiles', () => ({
    openSessionOwnerFile: () => ({
        getString: (key: string) => mockEntries.get(key),
        set: (key: string, value: string) => void mockEntries.set(key, value),
        remove: (key: string) => mockEntries.delete(key),
    }),
}));

const mockDebug = { enabled: false, hydrated: true };
const mockDebugListeners = new Set<() => void>();
jest.mock('../../stores/debugSettingsStore', () => ({
    useDebugSettingsStore: {
        getState: () => ({ debugModeEnabled: mockDebug.enabled }),
        subscribe: (listener: () => void) => (
            mockDebugListeners.add(listener),
            () => mockDebugListeners.delete(listener)
        ),
        persist: {
            hasHydrated: () => mockDebug.hydrated,
            onFinishHydration: () => () => undefined,
        },
    },
}));

const setDebugMode = (enabled: boolean) => {
    mockDebug.enabled = enabled;
    mockDebugListeners.forEach(listener => listener());
};

const fakeBridge = () => {
    const handlers = new Map<string, (message: unknown) => Promise<any>>();
    return {
        handlers,
        registerHandler: jest.fn((type: string, handler: (message: unknown) => Promise<any>) => {
            handlers.set(type, handler);
        }),
        unregisterHandler: jest.fn((type: string) => void handlers.delete(type)),
    };
};

describe('useSessionOwnerHandler', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        mockRestart.mockReset();
        mockEntries.clear();
        mockStage = 'DEV';
        mockBuildDefault = 'web';
        mockDebug.enabled = false;
        mockDebug.hydrated = true;
        mockDebugListeners.clear();
    });

    afterEach(() => jest.useRealTimers());

    it('refuses the switch in a production build while debug mode is off', async () => {
        mockStage = 'PROD';
        const bridge = fakeBridge();
        renderHook(() => useSessionOwnerHandler(bridge as any));

        const reply = await bridge.handlers.get('SetSessionOwner')?.({
            type: 'SetSessionOwner',
            data: { owner: 'native' },
        });

        expect(reply).toEqual(
            expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'NOT_ALLOWED' }) })
        );
        expect(mockEntries.size).toBe(0);
    });

    it('offers the switch in a production build once debug mode is on', async () => {
        mockStage = 'PROD';
        const bridge = fakeBridge();
        renderHook(() => useSessionOwnerHandler(bridge as any));
        setDebugMode(true);

        const reply = await bridge.handlers.get('SetSessionOwner')?.({
            type: 'SetSessionOwner',
            data: { owner: 'native' },
        });

        expect(reply).toEqual({ type: 'OnSetSessionOwner', success: true, data: { next: 'native', restarting: true } });
        expect(mockEntries.get('sessionOwner')).toBe('native');
    });

    it('keeps a production install on the runtime when debug mode goes off', () => {
        mockStage = 'PROD';
        mockDebug.enabled = true;
        mockEntries.set('sessionOwner', 'native');
        renderHook(() => useSessionOwnerHandler(fakeBridge() as any));

        setDebugMode(false);

        expect(mockEntries.get('sessionOwner')).toBe('native');
    });

    it('answers the current and next owner outside production', async () => {
        mockEntries.set('sessionOwner', 'native');
        const bridge = fakeBridge();
        renderHook(() => useSessionOwnerHandler(bridge as any));

        const reply = await bridge.handlers.get('FetchSessionOwner')?.({ type: 'FetchSessionOwner', data: {} });

        expect(reply).toEqual({ type: 'OnFetchSessionOwner', success: true, data: { current: 'web', next: 'native' } });
    });

    it("answers the build's default as the next owner when nothing is recorded", async () => {
        mockBuildDefault = 'native';
        const bridge = fakeBridge();
        renderHook(() => useSessionOwnerHandler(bridge as any));

        const reply = await bridge.handlers.get('FetchSessionOwner')?.({ type: 'FetchSessionOwner', data: {} });

        expect(reply).toEqual({ type: 'OnFetchSessionOwner', success: true, data: { current: 'web', next: 'native' } });
    });

    it('records a new owner and restarts the app after answering', async () => {
        const bridge = fakeBridge();
        renderHook(() => useSessionOwnerHandler(bridge as any));

        const reply = await bridge.handlers.get('SetSessionOwner')?.({
            type: 'SetSessionOwner',
            data: { owner: 'native' },
        });

        expect(reply).toEqual({ type: 'OnSetSessionOwner', success: true, data: { next: 'native', restarting: true } });
        expect(mockEntries.get('sessionOwner')).toBe('native');
        jest.runAllTimers();
        expect(mockRestart).toHaveBeenCalledWith({ reason: 'session-owner-changed' });
    });

    it('refuses an owner this build does not know, and records nothing', async () => {
        const bridge = fakeBridge();
        renderHook(() => useSessionOwnerHandler(bridge as any));

        const reply = await bridge.handlers.get('SetSessionOwner')?.({
            type: 'SetSessionOwner',
            data: { owner: 'shell' },
        });

        expect(reply).toEqual(
            expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'INVALID_OWNER' }) })
        );
        expect(mockEntries.size).toBe(0);
        jest.runAllTimers();
        expect(mockRestart).not.toHaveBeenCalled();
    });

    it("records the page's default on a production build with debug mode off, and restarts nothing", async () => {
        mockStage = 'PROD';
        const bridge = fakeBridge();
        renderHook(() => useSessionOwnerHandler(bridge as any));

        const reply = await bridge.handlers.get('SetDefaultSessionOwner')?.({
            type: 'SetDefaultSessionOwner',
            data: { owner: 'native' },
        });

        expect(reply).toEqual({
            type: 'OnSetDefaultSessionOwner',
            success: true,
            data: { default: 'native', next: 'native' },
        });
        expect(mockEntries.get('defaultSessionOwner')).toBe('native');
        expect(mockEntries.has('sessionOwner')).toBe(false);
        jest.runAllTimers();
        expect(mockRestart).not.toHaveBeenCalled();
    });

    it("answers the switch's choice as the next owner over the page's default", async () => {
        mockStage = 'PROD';
        mockEntries.set('sessionOwner', 'web');
        const bridge = fakeBridge();
        renderHook(() => useSessionOwnerHandler(bridge as any));

        const reply = await bridge.handlers.get('SetDefaultSessionOwner')?.({
            type: 'SetDefaultSessionOwner',
            data: { owner: 'native' },
        });

        expect(reply).toEqual(expect.objectContaining({ data: { default: 'native', next: 'web' } }));
        expect(mockEntries.get('sessionOwner')).toBe('web');
    });

    it("clears the page's default and falls back to the build's", async () => {
        mockEntries.set('defaultSessionOwner', 'native');
        const bridge = fakeBridge();
        renderHook(() => useSessionOwnerHandler(bridge as any));

        const reply = await bridge.handlers.get('SetDefaultSessionOwner')?.({
            type: 'SetDefaultSessionOwner',
            data: { owner: null },
        });

        expect(reply).toEqual(expect.objectContaining({ data: { default: null, next: 'web' } }));
        expect(mockEntries.has('defaultSessionOwner')).toBe(false);
    });

    it("shows the page's default as the next owner on the switch's own screen", async () => {
        mockEntries.set('defaultSessionOwner', 'native');
        const bridge = fakeBridge();
        renderHook(() => useSessionOwnerHandler(bridge as any));

        const reply = await bridge.handlers.get('FetchSessionOwner')?.({ type: 'FetchSessionOwner', data: {} });

        expect(reply).toEqual({ type: 'OnFetchSessionOwner', success: true, data: { current: 'web', next: 'native' } });
    });

    it('unregisters every request on unmount', () => {
        const bridge = fakeBridge();
        const { unmount } = renderHook(() => useSessionOwnerHandler(bridge as any));

        unmount();

        expect(bridge.handlers.size).toBe(0);
    });
});
