import { act, renderHook } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';

import { useAccessiblePlaceIds } from './useAccessiblePlaceIds';
import { COLD_LIST_WINDOW_MS } from './useColdListWindow';

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: jest.fn(),
        },
        session: {
            useGlobalSession: jest.fn(),
            useSessionSelection: jest.fn(),
        },
    },
}));

const observeListMock = jest.fn();

/** Wire observeList to immediately emit places with the given ids. */
const emit = (ids: string[]) =>
    observeListMock.mockImplementation((_query, cb) => {
        cb({ list: ids.map(id => ({ id })) });
        return jest.fn();
    });

beforeEach(() => {
    jest.clearAllMocks();
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({ place: { observeList: observeListMock } });
    (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({ selectedCloudId: 'cloud-A' });
    (runtime.session.useGlobalSession as jest.Mock).mockReturnValue({ identity: { userId: 'u1' } });
});

describe('useAccessiblePlaceIds — reachable places of the active cloud', () => {
    it('returns the ids the cache emitted', () => {
        emit(['site-1', 'site-2']);

        const { result } = renderHook(() => useAccessiblePlaceIds());

        expect(result.current).toEqual(new Set(['site-1', 'site-2']));
    });

    it('answers null while the cache has not emitted — "don\'t know yet", not "no places"', () => {
        observeListMock.mockImplementation(() => jest.fn());

        const { result } = renderHook(() => useAccessiblePlaceIds());

        expect(result.current).toBeNull();
    });

    it('answers null for an empty cache nothing has explained yet', () => {
        // A cloud this device has never opened. Handing back a real (empty) set here filtered every
        // channel out of the lists and the badge for the length of a cold cloud switch.
        emit([]);

        const { result } = renderHook(() => useAccessiblePlaceIds());

        expect(result.current).toBeNull();
    });

    it('settles back on the empty set once the window elapses', () => {
        // `null` means "do not filter", so it cannot be held forever: a cloud whose places really
        // did all go away has to let the filter drop their orphaned channels off the badge again.
        jest.useFakeTimers();
        emit([]);

        const { result } = renderHook(() => useAccessiblePlaceIds());
        expect(result.current).toBeNull();

        act(() => {
            jest.advanceTimersByTime(COLD_LIST_WINDOW_MS);
        });

        expect(result.current).toEqual(new Set());
        jest.useRealTimers();
    });
});
