import { renderHook } from '@testing-library/react';

import { useBackgroundReceive } from './useBackgroundReceive';

const mockStop = jest.fn();
const mockStart = jest.fn(() => mockStop);
jest.mock('../../socket/sync/runtime', () => ({ startBackgroundReceive: () => mockStart() }));

describe('useBackgroundReceive', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('receives while mounted and stops on unmount', () => {
        const { unmount } = renderHook(() => useBackgroundReceive(true));
        expect(mockStart).toHaveBeenCalledTimes(1);

        unmount();
        expect(mockStop).toHaveBeenCalledTimes(1);
    });

    it('starts nothing when disabled', () => {
        renderHook(() => useBackgroundReceive(false));
        expect(mockStart).not.toHaveBeenCalled();
    });
});
