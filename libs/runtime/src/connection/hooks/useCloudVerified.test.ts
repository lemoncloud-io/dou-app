import { renderHook } from '@testing-library/react';

import { useCloudVerified } from './useCloudVerified';

const mockUseSlotVerified = jest.fn((_slot: string) => true);
jest.mock('./useSlotVerified', () => ({ useSlotVerified: (slot: string) => mockUseSlotVerified(slot) }));

beforeEach(() => mockUseSlotVerified.mockClear());

describe('useCloudVerified', () => {
    it("asks about the named cloud's own slot", () => {
        const { result } = renderHook(() => useCloudVerified('cloud-a'));

        expect(mockUseSlotVerified).toHaveBeenCalledWith('cloud-a');
        expect(result.current).toBe(true);
    });

    it('reads a missing cloud id as the relay instead of refusing it', () => {
        renderHook(() => useCloudVerified(''));
        renderHook(() => useCloudVerified(null));

        expect(mockUseSlotVerified.mock.calls.map(([slot]) => slot)).toEqual(['default', 'default']);
    });
});
