import { act, renderHook } from '@testing-library/react';

import { useSlotStatuses } from './useSlotStatuses';

const mockGetSlotStatuses = jest.fn();
jest.mock('@chatic/app-runtime', () => ({
    runtime: { connection: { getSocketManager: () => ({ getSlotStatuses: () => mockGetSlotStatuses() }) } },
}));

const relay = { key: 'default', kind: 'relay', active: true, state: 'connected', verified: true, connectCount: 1 };
const cloud = { key: 'cloud-a', kind: 'cloud', active: false, state: 'connected', verified: true, connectCount: 1 };

describe('useSlotStatuses', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('reads the slots at once and again every second', () => {
        mockGetSlotStatuses.mockReturnValue([relay]);
        const { result } = renderHook(() => useSlotStatuses());
        expect(result.current).toEqual([relay]);

        mockGetSlotStatuses.mockReturnValue([relay, cloud]);
        act(() => jest.advanceTimersByTime(1_000));

        expect(result.current).toEqual([relay, cloud]);
    });

    it('stops reading on unmount', () => {
        mockGetSlotStatuses.mockReturnValue([]);
        const { unmount } = renderHook(() => useSlotStatuses());
        unmount();
        mockGetSlotStatuses.mockClear();

        jest.advanceTimersByTime(5_000);

        expect(mockGetSlotStatuses).not.toHaveBeenCalled();
    });
});
