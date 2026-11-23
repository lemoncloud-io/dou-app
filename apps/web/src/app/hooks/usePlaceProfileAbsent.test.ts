import { act, renderHook, waitFor } from '@testing-library/react';

const isPlaceProfileAbsent = jest.fn();
let mockSid: string | null = 'site-1';
let mockUid: string | null = 'user-1';

const repositories = { profile: { id: 'profile-repo' } };
jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        data: {
            useRuntimeRepositories: () => repositories,
        },
        session: {
            useSessionSelection: () => ({ selectedSiteId: mockSid }),
            useSessionIdentity: () => ({ userId: mockUid }),
        },
    })
);

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

    it('answers pending, not the previous place, on the render that moves the key', async () => {
        isPlaceProfileAbsent.mockResolvedValue(true);
        const answers: Array<[string | null, boolean | undefined]> = [];
        const { result, rerender } = renderHook(() => {
            const gate = usePlaceProfileAbsent();
            answers.push([mockSid, gate.absent]);
            return gate;
        });
        await waitFor(() => expect(result.current.absent).toBe(true));

        isPlaceProfileAbsent.mockReturnValue(new Promise(() => undefined));
        mockSid = 'site-2';
        rerender();

        expect(answers.filter(([sid]) => sid === 'site-2').map(([, absent]) => absent)).not.toContain(true);
        expect(result.current.absent).toBeUndefined();
    });

    it('holds the read while disabled, and makes it once enabled', async () => {
        isPlaceProfileAbsent.mockResolvedValue(true);
        let enabled = false;
        const { result, rerender } = renderHook(() => usePlaceProfileAbsent({ enabled }));

        expect(result.current.absent).toBeUndefined();
        expect(isPlaceProfileAbsent).not.toHaveBeenCalled();

        enabled = true;
        rerender();

        await waitFor(() => expect(result.current.absent).toBe(true));
        expect(isPlaceProfileAbsent).toHaveBeenCalledTimes(1);
    });

    it('still settles to present with no site while disabled', () => {
        mockSid = null;
        const { result } = renderHook(() => usePlaceProfileAbsent({ enabled: false }));

        expect(result.current.absent).toBe(false);
    });
});
