import { act, renderHook } from '@testing-library/react';

import { runtime } from '@chatic/runtime';

import { useAccessiblePlaceIds } from './useAccessiblePlaceIds';
import { COLD_LIST_WINDOW_MS } from './useColdListWindow';

jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        data: {
            useRuntimeRepositories: jest.fn(),
        },
        session: {
            useGlobalSession: jest.fn(),
            useSessionSelection: jest.fn(),
        },
    })
);

const observeListMock = jest.fn();

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
        emit([]);

        const { result } = renderHook(() => useAccessiblePlaceIds());

        expect(result.current).toBeNull();
    });

    it('settles back on the empty set once the window elapses', () => {
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
