import { act, renderHook, waitFor } from '@testing-library/react';

const isPlaceProfileAbsent = jest.fn();
let mockSid: string | null = 'site-1';
let mockUid: string | null = 'user-1';

// One shared object, like the real DataManager (`getRepositories` returns a stored field). A fresh
// object per call would change the effect's dependency every render and reset the verdict forever.
const repositories = { profile: { id: 'profile-repo' } };
jest.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: () => repositories,
    useSessionSelection: () => ({ selectedSiteId: mockSid }),
    useSessionIdentity: () => ({ userId: mockUid }),
}));

// The judgement itself is covered by utils/placeProfile.test.ts; here it is a controllable promise.
jest.mock('../utils/placeProfile', () => ({
    isPlaceProfileAbsent: (...args: unknown[]) => isPlaceProfileAbsent(...args),
}));

import { usePlaceProfileAbsent } from './usePlaceProfileAbsent';

beforeEach(() => {
    jest.clearAllMocks();
    mockSid = 'site-1';
    mockUid = 'user-1';
    isPlaceProfileAbsent.mockResolvedValue(false);
});

describe('usePlaceProfileAbsent', () => {
    it('starts undefined so callers can hold the render until the answer lands', () => {
        isPlaceProfileAbsent.mockReturnValue(new Promise(() => undefined));
        const { result } = renderHook(() => usePlaceProfileAbsent());

        expect(result.current.absent).toBeUndefined();
    });

    it.each([
        ['absent', true],
        ['present', false],
    ])('resolves to %s', async (_label, verdict) => {
        isPlaceProfileAbsent.mockResolvedValue(verdict);
        const { result } = renderHook(() => usePlaceProfileAbsent());

        await waitFor(() => expect(result.current.absent).toBe(verdict));
    });

    // Fails open rather than pending: without a site the answer never comes, and a caller holding its
    // render on `undefined` would wait forever (a blank screen). Nothing to require, so nothing to gate.
    it.each([
        ['no active site', () => (mockSid = null)],
        ['no identity', () => (mockUid = null)],
    ])('settles to present with %s — there is nothing to judge', (_label, setup) => {
        setup();
        const { result } = renderHook(() => usePlaceProfileAbsent());

        expect(result.current.absent).toBe(false);
        expect(isPlaceProfileAbsent).not.toHaveBeenCalled();
    });

    it('hands the judgement the profile repository, not the whole bag', async () => {
        const { result } = renderHook(() => usePlaceProfileAbsent());
        await waitFor(() => expect(result.current.absent).toBe(false));

        expect(isPlaceProfileAbsent).toHaveBeenCalledWith(repositories.profile);
    });

    // Guest→main promotion swaps uid while the relay site stays put. A verdict computed as the device
    // user must not carry over, or the promoted user (who has no profile) skips the gate.
    it('re-judges when the identity changes even though the site does not', async () => {
        const { result, rerender } = renderHook(() => usePlaceProfileAbsent());
        await waitFor(() => expect(result.current.absent).toBe(false));

        isPlaceProfileAbsent.mockResolvedValue(true);
        mockUid = 'user-2';
        rerender();

        await waitFor(() => expect(result.current.absent).toBe(true));
        expect(isPlaceProfileAbsent).toHaveBeenCalledTimes(2);
    });

    it('markPresent settles the gate without another round trip', async () => {
        isPlaceProfileAbsent.mockResolvedValue(true);
        const { result } = renderHook(() => usePlaceProfileAbsent());
        await waitFor(() => expect(result.current.absent).toBe(true));

        act(() => result.current.markPresent());

        expect(result.current.absent).toBe(false);
        expect(isPlaceProfileAbsent).toHaveBeenCalledTimes(1);
    });

    it('re-judges when the active site changes', async () => {
        const { result, rerender } = renderHook(() => usePlaceProfileAbsent());
        await waitFor(() => expect(result.current.absent).toBe(false));

        isPlaceProfileAbsent.mockResolvedValue(true);
        mockSid = 'site-2';
        rerender();

        await waitFor(() => expect(result.current.absent).toBe(true));
        expect(isPlaceProfileAbsent).toHaveBeenCalledTimes(2);
    });

    // The `alive` guard's real job: a slow verdict for the PREVIOUS key must not land on the new one.
    // Deleting the guard makes this fail (site-1's late `true` would overwrite site-2's `false`).
    it('drops a verdict that resolves after the key moved on', async () => {
        let settleFirst: (v: boolean) => void = () => undefined;
        isPlaceProfileAbsent.mockReturnValueOnce(new Promise<boolean>(resolve => (settleFirst = resolve)));
        const { result, rerender } = renderHook(() => usePlaceProfileAbsent());

        isPlaceProfileAbsent.mockResolvedValue(false);
        mockSid = 'site-2';
        rerender();
        await waitFor(() => expect(result.current.absent).toBe(false));

        await act(async () => {
            settleFirst(true);
        });

        expect(result.current.absent).toBe(false);
    });
});
