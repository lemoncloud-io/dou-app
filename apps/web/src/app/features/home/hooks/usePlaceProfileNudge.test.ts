import { act, renderHook } from '@testing-library/react';

const mockUsePlaceProfileAbsent = jest.fn();
const mockMarkPresent = jest.fn();
let mockIsVerified = true;
let mockSid: string | null = 'site-1';
let mockUid: string | null = 'user-1';
// In-flight switches app-wide, per mutation key, as `useIsMutating` counts them.
let mockSwitches: Record<string, number> = {};

jest.mock('@tanstack/react-query', () => ({
    useIsMutating: ({ mutationKey }: { mutationKey: string[] }) => mockSwitches[mutationKey.join('/')] ?? 0,
}));

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        connection: { useRuntimeSocketState: () => ({ isVerified: mockIsVerified }) },
        session: {
            SWITCH_SITE_MUTATION_KEY: ['session', 'switch-site'],
            SWITCH_CLOUD_MUTATION_KEY: ['session', 'switch-cloud'],
            useSessionSelection: () => ({ selectedSiteId: mockSid }),
            useSessionIdentity: () => ({ userId: mockUid }),
        },
    },
}));
// The read itself is covered by usePlaceProfileAbsent's own suite; here it is the verdict it gives.
jest.mock('../../../hooks/usePlaceProfileAbsent', () => ({
    usePlaceProfileAbsent: (options: { enabled?: boolean }) => mockUsePlaceProfileAbsent(options),
}));

import { usePlaceProfileBannerStore } from '../stores/usePlaceProfileBannerStore';
import { usePlaceProfileNudge } from './usePlaceProfileNudge';

const settled = { nick: undefined };

beforeEach(() => {
    jest.clearAllMocks();
    mockIsVerified = true;
    mockSid = 'site-1';
    mockUid = 'user-1';
    mockSwitches = {};
    mockUsePlaceProfileAbsent.mockReturnValue({ absent: true, markPresent: mockMarkPresent });
    usePlaceProfileBannerStore.setState({ dismissed: {} });
});

describe('usePlaceProfileNudge', () => {
    it('shows once the server says I have no profile in the active place', () => {
        const { result } = renderHook(() => usePlaceProfileNudge(settled));

        expect(result.current.isVisible).toBe(true);
    });

    // A cache that does not hold my row yet is not an answer; only the server's "absent" is.
    it.each([
        ['the answer is still out', undefined],
        ['a profile exists', false],
    ])('stays hidden while %s', (_label, absent) => {
        mockUsePlaceProfileAbsent.mockReturnValue({ absent, markPresent: mockMarkPresent });
        const { result } = renderHook(() => usePlaceProfileNudge(settled));

        expect(result.current.isVisible).toBe(false);
    });

    // Sent before the socket is up the read fails and the judgement fails open, so the banner would
    // be missing on a cold start; sent mid-switch it answers for the place being left.
    // A push tap or the search screen switches places with home still mounted, so home's own flag
    // is not enough: the count is app-wide, on both keys.
    it.each([
        ['the socket is not verified', () => (mockIsVerified = false)],
        ['a place switch is in flight anywhere', () => (mockSwitches = { 'session/switch-site': 1 })],
        ['a cloud switch is in flight anywhere', () => (mockSwitches = { 'session/switch-cloud': 1 })],
    ])('holds the read while %s', (_label, setup) => {
        setup();
        renderHook(() => usePlaceProfileNudge(settled));

        expect(mockUsePlaceProfileAbsent).toHaveBeenLastCalledWith({ enabled: false });
    });

    // Someone with a profile can never see the banner; asking again on every return to home and every
    // reconnect only costs requests, and a read failing open would take down a correct banner.
    it('holds the read once the cache holds a nick', () => {
        renderHook(() => usePlaceProfileNudge({ nick: 'Raine' }));

        expect(mockUsePlaceProfileAbsent).toHaveBeenLastCalledWith({ enabled: false });
    });

    it('lets the read run once connected and settled', () => {
        renderHook(() => usePlaceProfileNudge(settled));

        expect(mockUsePlaceProfileAbsent).toHaveBeenLastCalledWith({ enabled: true });
    });

    it('stays hidden during a switch even with an "absent" verdict in hand', () => {
        mockSwitches = { 'session/switch-site': 1 };
        const { result } = renderHook(() => usePlaceProfileNudge(settled));

        expect(result.current.isVisible).toBe(false);
    });

    // A save writes my nick to the cache before anything re-reads; the banner goes with it.
    it('hides as soon as the cache holds a nick for me', () => {
        const { result } = renderHook(() => usePlaceProfileNudge({ nick: 'Raine' }));

        expect(result.current.isVisible).toBe(false);
    });

    it('treats a blank nick as no nick', () => {
        const { result } = renderHook(() => usePlaceProfileNudge({ nick: '  ' }));

        expect(result.current.isVisible).toBe(true);
    });

    it('stays hidden with no active place', () => {
        mockSid = null;
        const { result } = renderHook(() => usePlaceProfileNudge(settled));

        expect(result.current.isVisible).toBe(false);
    });

    it('closes for this place only, and stays closed when home mounts again', () => {
        const { result, unmount } = renderHook(() => usePlaceProfileNudge(settled));

        act(() => result.current.dismiss());
        expect(result.current.isVisible).toBe(false);

        unmount();
        expect(renderHook(() => usePlaceProfileNudge(settled)).result.current.isVisible).toBe(false);

        mockSid = 'site-2';
        expect(renderHook(() => usePlaceProfileNudge(settled)).result.current.isVisible).toBe(true);
    });

    it('closes per person: another account on the same place still sees it', () => {
        const { result } = renderHook(() => usePlaceProfileNudge(settled));
        act(() => result.current.dismiss());

        mockUid = 'user-2';
        expect(renderHook(() => usePlaceProfileNudge(settled)).result.current.isVisible).toBe(true);
    });

    it('hands back the verdict hook markPresent, so a save needs no second read', () => {
        const { result } = renderHook(() => usePlaceProfileNudge(settled));

        result.current.markPresent();

        expect(mockMarkPresent).toHaveBeenCalledTimes(1);
    });
});
