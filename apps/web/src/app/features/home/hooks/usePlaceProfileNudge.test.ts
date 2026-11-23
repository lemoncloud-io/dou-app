import { act, renderHook } from '@testing-library/react';

const mockUsePlaceProfileAbsent = jest.fn();
const mockMarkPresent = jest.fn();
let mockIsVerified = true;
let mockSid: string | null = 'site-1';
let mockUid: string | null = 'user-1';
let mockSwitches: Record<string, number> = {};

jest.mock('@tanstack/react-query', () => ({
    useIsMutating: ({ mutationKey }: { mutationKey: string[] }) => mockSwitches[mutationKey.join('/')] ?? 0,
}));

jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        connection: { useRuntimeSocketState: () => ({ isVerified: mockIsVerified }) },
        session: {
            SWITCH_SITE_MUTATION_KEY: ['session', 'switch-site'],
            SWITCH_CLOUD_MUTATION_KEY: ['session', 'switch-cloud'],
            useSessionSelection: () => ({ selectedSiteId: mockSid }),
            useSessionIdentity: () => ({ userId: mockUid }),
        },
    })
);
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

    it.each([
        ['the answer is still out', undefined],
        ['a profile exists', false],
    ])('stays hidden while %s', (_label, absent) => {
        mockUsePlaceProfileAbsent.mockReturnValue({ absent, markPresent: mockMarkPresent });
        const { result } = renderHook(() => usePlaceProfileNudge(settled));

        expect(result.current.isVisible).toBe(false);
    });

    it.each([
        ['the socket is not verified', () => (mockIsVerified = false)],
        ['a place switch is in flight anywhere', () => (mockSwitches = { 'session/switch-site': 1 })],
        ['a cloud switch is in flight anywhere', () => (mockSwitches = { 'session/switch-cloud': 1 })],
    ])('holds the read while %s', (_label, setup) => {
        setup();
        renderHook(() => usePlaceProfileNudge(settled));

        expect(mockUsePlaceProfileAbsent).toHaveBeenLastCalledWith({ enabled: false });
    });

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
