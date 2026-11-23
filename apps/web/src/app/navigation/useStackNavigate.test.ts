import { act, renderHook } from '@testing-library/react';

import { routeStackTracker } from './stackTracker';
import { useStackNavigate } from './useStackNavigate';

jest.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn() } }));

const navigate = jest.fn();

const standingAt = (location: string, depth: number | null) =>
    window.history.pushState(depth === null ? { noIndex: true } : { idx: depth }, '', location);

const enter = (entry: Parameters<ReturnType<typeof useStackNavigate>>[0], to: string) =>
    renderHook(() => useStackNavigate()).result.current(entry, to);

describe('useStackNavigate', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        standingAt('/', 0);
    });

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

    it('reads the location at call time, not at render time', () => {
        const { result } = renderHook(() => useStackNavigate());

        standingAt('/channels/c1/room', 1);
        result.current('push', '/channels/c2/room');

        expect(navigate).toHaveBeenCalledWith('/channels/c2/room', { replace: true });
    });

    it('falls back to replace when the depth cannot be read', () => {
        standingAt('/some-screen', null);

        enter('auth-transition', '/');

        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });
});

describe('useStackNavigate — collapsing a feature graph', () => {
    const observed = (pathnames: string[]) => {
        routeStackTracker.reset();
        pathnames.forEach((pathname, index) => routeStackTracker.record({ pathname, action: 'PUSH', index }));
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation(
            cb => setTimeout(() => cb(0), 0) as unknown as number
        );
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
        routeStackTracker.reset();
    });

    it('rewinds the graph first and pushes the target only once the pop has landed', () => {
        observed(['/', '/channels/A/room', '/channels/A/settings']);
        standingAt('/channels/A/settings', 2);

        enter('push', '/channels/B/room');

        expect(navigate).toHaveBeenCalledTimes(1);
        expect(navigate).toHaveBeenCalledWith(-2);

        act(() => {
            window.dispatchEvent(new PopStateEvent('popstate'));
            jest.advanceTimersByTime(0);
        });

        expect(navigate).toHaveBeenCalledTimes(2);
        expect(navigate).toHaveBeenLastCalledWith('/channels/B/room');
    });

    it('pushes anyway when the pop never arrives', () => {
        observed(['/', '/channels/A/room', '/channels/A/settings']);
        standingAt('/channels/A/settings', 2);

        enter('push', '/channels/B/room');
        expect(navigate).toHaveBeenCalledTimes(1);

        act(() => void jest.advanceTimersByTime(300));

        expect(navigate).toHaveBeenCalledTimes(2);
        expect(navigate).toHaveBeenLastCalledWith('/channels/B/room');
    });

    it('pushes the target exactly once when the pop and the ceiling both fire', () => {
        observed(['/', '/channels/A/room', '/channels/A/settings']);
        standingAt('/channels/A/settings', 2);

        enter('push', '/channels/B/room');

        act(() => {
            window.dispatchEvent(new PopStateEvent('popstate'));
            jest.advanceTimersByTime(600);
        });

        expect(navigate).toHaveBeenCalledTimes(2);
    });

    it('falls back to replace when the tracker lost its index', () => {
        observed(['/', '/channels/A/room']);
        routeStackTracker.record({ pathname: '/channels/A/settings', action: 'PUSH', index: null });
        standingAt('/channels/A/room', 1);

        enter('push', '/channels/B/room');

        expect(navigate).toHaveBeenCalledWith('/channels/B/room', { replace: true });
    });
});
