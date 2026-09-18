import { renderHook } from '@testing-library/react';

import { useStackNavigate } from './useStackNavigate';

jest.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn() } }));

const navigate = jest.fn();

/** Puts the WebView on a screen at a given depth, the way the router would have. */
const standingAt = (location: string, depth: number | null) =>
    window.history.pushState(depth === null ? { noIndex: true } : { idx: depth }, '', location);

const enter = (entry: Parameters<ReturnType<typeof useStackNavigate>>[0], to: string) =>
    renderHook(() => useStackNavigate()).result.current(entry, to);

describe('useStackNavigate', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        standingAt('/', 0);
    });

    // The three actions the policy can ask for, each mapped to the one router call that performs it.
    it('pushes when the policy says push', () => {
        standingAt('/mypage', 1);

        enter('push', '/channels/c1/room');

        expect(navigate).toHaveBeenCalledWith('/channels/c1/room');
    });

    it('replaces when the policy says replace', () => {
        standingAt('/channels/c1/room', 1);

        enter('push', '/channels/c2/room');

        expect(navigate).toHaveBeenCalledWith('/channels/c2/room', { replace: true });
    });

    // `back` rewinds rather than navigating to the target — the target is only the fallback the
    // policy uses when there is nothing to rewind onto.
    it('rewinds when the policy says back, ignoring the target', () => {
        standingAt('/some-screen', 3);

        enter('auth-transition', '/');

        expect(navigate).toHaveBeenCalledWith(-1);
    });

    it('does nothing when the policy says skip', () => {
        standingAt('/mypage', 1);

        enter('push', '/mypage');

        expect(navigate).not.toHaveBeenCalled();
    });

    // The reason this hook reads `window.location` instead of `useLocation`: callers reach it after
    // awaiting cloud and site switches, by which time a captured location can be several screens
    // stale, and the policy's first rule compares against exactly this value.
    it('reads the location at call time, not at render time', () => {
        const { result } = renderHook(() => useStackNavigate());

        // Rendered while at home; the app moves into a room before the callback is invoked.
        standingAt('/channels/c1/room', 1);
        result.current('push', '/channels/c2/room');

        // A render-time location would have said "leaving home" and pushed.
        expect(navigate).toHaveBeenCalledWith('/channels/c2/room', { replace: true });
    });

    // An index the router did not write means something bypassed it; rewinding blind is the one
    // outcome worse than not rewinding.
    it('falls back to replace when the depth cannot be read', () => {
        standingAt('/some-screen', null);

        enter('auth-transition', '/');

        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });
});
