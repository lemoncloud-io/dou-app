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

jest.mock('../../services/runtime/launchSessionOwner', () => ({ launchSessionOwner: () => 'web' }));

const mockEntries = new Map<string, string>();
jest.mock('../../services/runtime/runtimeStorageFiles', () => ({
    openSessionOwnerFile: () => ({
        getString: (key: string) => mockEntries.get(key),
        set: (key: string, value: string) => void mockEntries.set(key, value),
    }),
}));

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
    });

    afterEach(() => jest.useRealTimers());

    it('registers nothing in a production build, so the overlay hears NOT_FOUND', () => {
        mockStage = 'PROD';
        const bridge = fakeBridge();

        renderHook(() => useSessionOwnerHandler(bridge as any));

        expect(bridge.registerHandler).not.toHaveBeenCalled();
    });

    it('answers the current and next owner outside production', async () => {
        mockEntries.set('sessionOwner', 'native');
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

    it('unregisters both requests on unmount', () => {
        const bridge = fakeBridge();
        const { unmount } = renderHook(() => useSessionOwnerHandler(bridge as any));

        unmount();

        expect(bridge.handlers.size).toBe(0);
    });
});
