import { act, renderHook } from '@testing-library/react';

import { runtime } from '@chatic/runtime';
import { CLOUD_PROMO_DISMISS_TTL_MS } from '../../../stores/preferenceKeys';
import { useCloudPromo } from './useCloudPromo';

jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({ settings: { set: jest.fn(), useConfigValue: jest.fn() } })
);

const mockUseConfigValue = runtime.settings.useConfigValue as jest.MockedFunction<
    typeof runtime.settings.useConfigValue
>;
const mockSet = runtime.settings.set as jest.Mock;

const NOW = 1_800_000_000_000;

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    mockUseConfigValue.mockReturnValue(0);
});

afterEach(() => jest.restoreAllMocks());

describe('useCloudPromo', () => {
    it('shows the banner when no cloud is owned and it was never dismissed', () => {
        const { result } = renderHook(() => useCloudPromo({ hasOwnedCloud: false }));
        expect(result.current.isVisible).toBe(true);
    });

    it('hides the banner permanently once a cloud is owned, even if never dismissed', () => {
        const { result } = renderHook(() => useCloudPromo({ hasOwnedCloud: true }));
        expect(result.current.isVisible).toBe(false);
    });

    it('hides the banner while the 24h dismiss window is still open', () => {
        mockUseConfigValue.mockReturnValue(NOW - 23 * 60 * 60 * 1000);

        const { result } = renderHook(() => useCloudPromo({ hasOwnedCloud: false }));
        expect(result.current.isVisible).toBe(false);
    });

    it('shows the banner again once the dismiss window has elapsed', () => {
        mockUseConfigValue.mockReturnValue(NOW - CLOUD_PROMO_DISMISS_TTL_MS - 1);

        const { result } = renderHook(() => useCloudPromo({ hasOwnedCloud: false }));
        expect(result.current.isVisible).toBe(true);
    });

    it('dismiss writes the current timestamp to the local lane', () => {
        const { result } = renderHook(() => useCloudPromo({ hasOwnedCloud: false }));

        act(() => result.current.dismiss());

        expect(mockSet).toHaveBeenCalledWith('ui.cloudPromoDismissedAt', NOW, { lane: 'local' });
    });

    it('hides the banner immediately once the resolved value reflects the dismiss', () => {
        const { result, rerender } = renderHook(() => useCloudPromo({ hasOwnedCloud: false }));
        expect(result.current.isVisible).toBe(true);

        act(() => result.current.dismiss());
        mockUseConfigValue.mockReturnValue(NOW);
        rerender();

        expect(result.current.isVisible).toBe(false);
    });
});
