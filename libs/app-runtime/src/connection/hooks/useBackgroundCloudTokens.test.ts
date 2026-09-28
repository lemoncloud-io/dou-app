import { act, renderHook } from '@testing-library/react';

import { backgroundClouds, resetBackgroundClouds } from '../../socket/backgroundClouds';
import { useBackgroundCloudTokens } from './useBackgroundCloudTokens';

const mockSync = jest.fn();
const mockDispose = jest.fn();
jest.mock('../../socket/auth/backgroundCloudTokens', () => ({
    BackgroundCloudTokens: jest.fn().mockImplementation(() => ({ sync: mockSync, dispose: mockDispose })),
}));
const mockSelection = jest.fn((): string[] => ['cloud-a']);
jest.mock('../utils/backgroundSlots', () => ({
    currentBackgroundSelection: () => mockSelection(),
    liveBackgroundReadiness: {},
}));
jest.mock('../../session/auth/cloudTokens', () => ({ issueCloudTokens: jest.fn() }));
let mockSlotListener: (() => void) | null = null;
const mockUnsubscribeSlots = jest.fn();
jest.mock('../../socket/runtime', () => ({
    getSocketManager: () => ({
        subscribeSlotClients: (listener: () => void) => {
            mockSlotListener = listener;
            return mockUnsubscribeSlots;
        },
    }),
}));
// A stable snapshot: `useSyncExternalStore` re-renders forever on a fresh object per read.
const mockSlotContext = {};
jest.mock('../../session/store', () => ({
    getSocketSlotContext: () => mockSlotContext,
    sessionSignal: { subscribe: jest.fn(() => () => undefined) },
}));

describe('useBackgroundCloudTokens', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetBackgroundClouds();
        mockSelection.mockReturnValue(['cloud-a']);
    });

    it('prepares the current selection while a relay session exists', () => {
        renderHook(() => useBackgroundCloudTokens(true));

        expect(mockSync).toHaveBeenLastCalledWith(['cloud-a']);
    });

    it('prepares nothing without one — and says so, so pending retries are forgotten', () => {
        renderHook(() => useBackgroundCloudTokens(false));

        expect(mockSync).toHaveBeenLastCalledWith([]);
        expect(mockSelection).not.toHaveBeenCalled();
    });

    it('re-checks when the background store announces — e.g. a cloud whose tokens were dropped', () => {
        renderHook(() => useBackgroundCloudTokens(true));
        mockSync.mockClear();
        mockSelection.mockReturnValue(['cloud-a', 'cloud-b']);

        act(() => backgroundClouds.invalidate());

        expect(mockSync).toHaveBeenCalledWith(['cloud-a', 'cloud-b']);
    });

    it("re-checks when a slot binds or goes away — a torn-down cloud is the preparer's again", () => {
        renderHook(() => useBackgroundCloudTokens(true));
        mockSync.mockClear();

        act(() => mockSlotListener?.());

        expect(mockSync).toHaveBeenCalledWith(['cloud-a']);
    });

    it('disposes the preparer and stops watching slots on unmount', () => {
        const { unmount } = renderHook(() => useBackgroundCloudTokens(true));

        unmount();

        expect(mockDispose).toHaveBeenCalledTimes(1);
        expect(mockUnsubscribeSlots).toHaveBeenCalledTimes(1);
    });
});
