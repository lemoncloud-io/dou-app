import { renderHook, waitFor } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';

import { useSenderProfiles } from './useSenderProfiles';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));
jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const observeList = jest.fn();
const cacheReadList = jest.fn();
const refreshItem = jest.fn();

/** Emits `list` to every observer of `{ sid }`, the way the profile cache stream does. */
const seedObserved = (list: Record<string, unknown>[]) =>
    observeList.mockImplementation((_query, cb) => {
        cb({ list });
        return () => undefined;
    });

beforeEach(() => {
    jest.clearAllMocks();
    seedObserved([]);
    cacheReadList.mockResolvedValue({ list: [] });
    refreshItem.mockResolvedValue(null);
    (useRuntimeRepositories as jest.Mock).mockReturnValue({
        profile: { observeList, cacheReadList, refreshItem },
    });
});

describe('useSenderProfiles', () => {
    it('fetches the authors the cache does not have, keyed `sid@uid`', async () => {
        // The point of going through the repository: a profile sync only runs inside a room, so a
        // search result from a room the user never opened has nothing cached to read.
        const { result } = renderHook(() =>
            useSenderProfiles([
                { sid: 'site-1', userId: 'user-2' },
                { sid: 'site-1', userId: 'user-3' },
            ])
        );

        await waitFor(() => expect(refreshItem).toHaveBeenCalledTimes(2));
        expect(refreshItem).toHaveBeenCalledWith('site-1@user-2');
        expect(refreshItem).toHaveBeenCalledWith('site-1@user-3');
        expect(result.current.size).toBe(0);
    });

    it('skips the fetch for an author the cache already holds', async () => {
        cacheReadList.mockResolvedValue({ list: [{ sid: 'site-1', userId: 'user-2', nick: 'Bora' }] });

        renderHook(() => useSenderProfiles([{ sid: 'site-1', userId: 'user-2' }]));

        await waitFor(() => expect(cacheReadList).toHaveBeenCalledWith({ sid: 'site-1' }));
        expect(refreshItem).not.toHaveBeenCalled();
    });

    it('returns observed profiles keyed by place and author', async () => {
        seedObserved([{ sid: 'site-1', userId: 'user-2', nick: 'Bora', thumbnail: 'data:image/png;base64,BBB' }]);

        const { result } = renderHook(() => useSenderProfiles([{ sid: 'site-1', userId: 'user-2' }]));

        await waitFor(() => expect(result.current.get('site-1@user-2')?.nick).toBe('Bora'));
        expect(result.current.get('site-1@user-2')?.thumbnail).toBe('data:image/png;base64,BBB');
    });

    it('keys an older row that only carries `uid` as its member id', async () => {
        // Profile rows set both `uid` and `userId` to the subject; older rows only set `uid`.
        seedObserved([{ sid: 'site-1', uid: 'user-2', nick: 'Bora' }]);

        const { result } = renderHook(() => useSenderProfiles([{ sid: 'site-1', userId: 'user-2' }]));

        await waitFor(() => expect(result.current.get('site-1@user-2')?.nick).toBe('Bora'));
    });

    it('subscribes once per place, not once per author', async () => {
        renderHook(() =>
            useSenderProfiles([
                { sid: 'site-1', userId: 'user-2' },
                { sid: 'site-1', userId: 'user-3' },
                { sid: 'site-2', userId: 'user-4' },
            ])
        );

        await waitFor(() => expect(observeList).toHaveBeenCalledTimes(2));
        expect(observeList.mock.calls.map(([query]) => query)).toEqual([{ sid: 'site-1' }, { sid: 'site-2' }]);
    });

    it('does not touch the repository without any author to resolve', async () => {
        renderHook(() => useSenderProfiles([]));

        expect(observeList).not.toHaveBeenCalled();
        expect(cacheReadList).not.toHaveBeenCalled();
        expect(refreshItem).not.toHaveBeenCalled();
    });

    it('ignores refs missing a place or an author', async () => {
        renderHook(() =>
            useSenderProfiles([
                { sid: '', userId: 'user-2' },
                { sid: 'site-1', userId: '' },
            ])
        );

        expect(observeList).not.toHaveBeenCalled();
    });

    it('re-resolves only when the author SET changes, not on a new array identity', async () => {
        const { rerender } = renderHook(({ refs }) => useSenderProfiles(refs), {
            initialProps: { refs: [{ sid: 'site-1', userId: 'user-2' }] },
        });

        await waitFor(() => expect(observeList).toHaveBeenCalledTimes(1));

        // Same authors, fresh array — the search rows are rebuilt on every render.
        rerender({ refs: [{ sid: 'site-1', userId: 'user-2' }] });
        expect(observeList).toHaveBeenCalledTimes(1);

        rerender({ refs: [{ sid: 'site-1', userId: 'user-9' }] });
        await waitFor(() => expect(observeList).toHaveBeenCalledTimes(2));
    });

    it('keeps the other names when one author cannot be fetched', async () => {
        refreshItem.mockImplementation((id: string) =>
            id === 'site-1@user-2' ? Promise.reject(new Error('gone')) : Promise.resolve(null)
        );

        renderHook(() =>
            useSenderProfiles([
                { sid: 'site-1', userId: 'user-2' },
                { sid: 'site-1', userId: 'user-3' },
            ])
        );

        await waitFor(() => expect(refreshItem).toHaveBeenCalledTimes(2));
        // A rejected author must not surface as an unhandled rejection or abort the batch.
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('logs and keeps going when the cache read itself fails', async () => {
        cacheReadList.mockRejectedValue(new Error('idb closed'));

        renderHook(() => useSenderProfiles([{ sid: 'site-1', userId: 'user-2' }]));

        await waitFor(() => expect(logger.warn).toHaveBeenCalled());
        expect(refreshItem).not.toHaveBeenCalled();
    });
});
