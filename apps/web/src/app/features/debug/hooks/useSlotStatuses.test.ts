import { act, renderHook } from '@testing-library/react';

import { useSlotStatuses } from './useSlotStatuses';

const mockGetSlotStatuses = jest.fn();
jest.mock('@chatic/app-runtime', () => ({
    runtime: { connection: { getSlotStatuses: () => mockGetSlotStatuses() } },
}));

const relay = { key: 'default', kind: 'relay', active: true, state: 'connected', verified: true, connectCount: 1 };
const cloud = { key: 'cloud-a', kind: 'cloud', active: false, state: 'connected', verified: true, connectCount: 1 };

/** Lets the pending `getSlotStatuses` answers land. */
const settle = () => act(async () => undefined);

describe('useSlotStatuses', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('starts empty, fills in with the first read, and reads again every second', async () => {
        mockGetSlotStatuses.mockResolvedValue([relay]);
        const { result } = renderHook(() => useSlotStatuses());
        expect(result.current).toEqual([]);

        await settle();
        expect(result.current).toEqual([relay]);

        mockGetSlotStatuses.mockResolvedValue([relay, cloud]);
        act(() => jest.advanceTimersByTime(1_000));
        await settle();

        expect(result.current).toEqual([relay, cloud]);
    });

    it('keeps the last list when a read fails', async () => {
        mockGetSlotStatuses.mockResolvedValue([relay]);
        const { result } = renderHook(() => useSlotStatuses());
        await settle();

        mockGetSlotStatuses.mockRejectedValue(new Error('gone'));
        act(() => jest.advanceTimersByTime(1_000));
        await settle();

        expect(result.current).toEqual([relay]);
    });

    it('stops reading on unmount', async () => {
        mockGetSlotStatuses.mockResolvedValue([]);
        const { unmount } = renderHook(() => useSlotStatuses());
        await settle();
        unmount();
        mockGetSlotStatuses.mockClear();

        jest.advanceTimersByTime(5_000);

        expect(mockGetSlotStatuses).not.toHaveBeenCalled();
    });
});
