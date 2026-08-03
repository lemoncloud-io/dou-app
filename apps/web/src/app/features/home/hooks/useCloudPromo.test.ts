import { act, renderHook } from '@testing-library/react';

import { useCloudSessionCatalog } from '@chatic/web-core';

import { usePreferenceStore } from '../../../stores/usePreferenceStore';
import { CLOUD_PROMO_DISMISS_TTL_MS } from '../../../stores/preferenceKeys';
import { useCloudPromo } from './useCloudPromo';

jest.mock('@chatic/web-core', () => ({ useCloudSessionCatalog: jest.fn() }));

// usePreferenceStore imports the app bridge, which pulls the socket lib into jest. The store test
// stubs it the same way — we only need the preference state here, not a real bridge.
jest.mock('@chatic/bridges', () => ({ isNative: jest.fn(() => false) }));
jest.mock('../../../bridge', () => ({ appBridge: { savePreference: jest.fn() } }));

const NOW = 1_800_000_000_000;

const setClouds = (count: number) =>
    (useCloudSessionCatalog as jest.Mock).mockReturnValue({
        clouds: Array.from({ length: count }, (_, i) => ({ id: `cloud-${i}`, status: 'active' })),
    });

/** Seed the store's dismiss timestamp directly (bypassing localStorage). */
const setDismissedAt = (cloudPromoDismissedAt: number) => usePreferenceStore.setState({ cloudPromoDismissedAt });

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    setClouds(0);
    setDismissedAt(0);
});

afterEach(() => jest.restoreAllMocks());

describe('useCloudPromo', () => {
    it('shows the banner when no cloud is owned and it was never dismissed', () => {
        const { result } = renderHook(() => useCloudPromo());
        expect(result.current.isVisible).toBe(true);
    });

    it('hides the banner permanently once a cloud is owned, even if never dismissed', () => {
        setClouds(1);

        const { result } = renderHook(() => useCloudPromo());
        expect(result.current.isVisible).toBe(false);
    });

    it('hides the banner while the 24h dismiss window is still open', () => {
        setDismissedAt(NOW - 23 * 60 * 60 * 1000);

        const { result } = renderHook(() => useCloudPromo());
        expect(result.current.isVisible).toBe(false);
    });

    it('shows the banner again once the dismiss window has elapsed', () => {
        setDismissedAt(NOW - CLOUD_PROMO_DISMISS_TTL_MS - 1);

        const { result } = renderHook(() => useCloudPromo());
        expect(result.current.isVisible).toBe(true);
    });

    it('hides the banner immediately when dismissed', () => {
        const { result } = renderHook(() => useCloudPromo());
        expect(result.current.isVisible).toBe(true);

        act(() => result.current.dismiss());

        expect(result.current.isVisible).toBe(false);
        expect(usePreferenceStore.getState().cloudPromoDismissedAt).toBe(NOW);
    });
});
