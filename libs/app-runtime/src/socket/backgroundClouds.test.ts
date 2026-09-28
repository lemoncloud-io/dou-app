import {
    MAX_BACKGROUND_CLOUDS,
    backgroundClouds,
    hasLiveJoinedSession,
    resetBackgroundClouds,
    selectBackgroundClouds,
} from './backgroundClouds';

const mockPeekCached = jest.fn((_cid: string): unknown => null);
jest.mock('../session/store/stores', () => ({
    cloudStore: { peekCachedCloudTokens: (cid: string) => mockPeekCached(cid) },
}));

const liveEntry = { delegationToken: { wss: 'wss://a' }, cloudToken: { Token: { identityToken: 'token' } } };

describe('selectBackgroundClouds', () => {
    it('keeps every joined cloud except relay and the committed one', () => {
        expect(selectBackgroundClouds({ joined: ['default', 'a', 'b', 'c'], recent: [], committed: 'b' })).toEqual([
            'a',
            'c',
        ]);
    });

    it('puts recently entered clouds first, then the rest in the app order', () => {
        expect(selectBackgroundClouds({ joined: ['a', 'b', 'c', 'd'], recent: ['c', 'a'], committed: null })).toEqual([
            'c',
            'a',
            'b',
            'd',
        ]);
    });

    it('ignores recent clouds the account no longer belongs to', () => {
        expect(selectBackgroundClouds({ joined: ['a'], recent: ['gone', 'a'], committed: null })).toEqual(['a']);
    });

    it('caps at the most recent five of seven joined clouds', () => {
        const joined = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];
        const recent = ['c7', 'c6', 'c5', 'c4', 'c3', 'c2', 'c1'];

        const selected = selectBackgroundClouds({ joined, recent, committed: null });

        expect(MAX_BACKGROUND_CLOUDS).toBe(5);
        expect(selected).toEqual(['c7', 'c6', 'c5', 'c4', 'c3']);
    });

    it('does not count the committed cloud against the cap', () => {
        const joined = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];

        expect(selectBackgroundClouds({ joined, recent: [], committed: 'c1' })).toEqual(['c2', 'c3', 'c4', 'c5', 'c6']);
    });

    it('drops empty ids and duplicates the app may hand over', () => {
        expect(selectBackgroundClouds({ joined: ['a', '', 'a', 'b'], recent: [], committed: null })).toEqual([
            'a',
            'b',
        ]);
    });

    it('selects nothing with a cap of zero', () => {
        expect(selectBackgroundClouds({ joined: ['a'], recent: [], committed: null, max: 0 })).toEqual([]);
    });
});

describe('backgroundClouds store', () => {
    beforeEach(() => resetBackgroundClouds());

    it('announces a new list and moves its version', () => {
        const listener = jest.fn();
        backgroundClouds.subscribe(listener);
        const before = backgroundClouds.getVersion();

        backgroundClouds.setJoined(['a', 'b']);

        expect(backgroundClouds.getJoined()).toEqual(['a', 'b']);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(backgroundClouds.getVersion()).toBe(before + 1);
    });

    it('stays quiet for a fresh array with the same members in the same order', () => {
        backgroundClouds.setJoined(['a', 'b']);
        const listener = jest.fn();
        backgroundClouds.subscribe(listener);

        backgroundClouds.setJoined(['a', 'b']);

        expect(listener).not.toHaveBeenCalled();
    });

    it('announces a reorder — the order is the policy tie-break', () => {
        backgroundClouds.setJoined(['a', 'b']);
        const listener = jest.fn();
        backgroundClouds.subscribe(listener);

        backgroundClouds.setJoined(['b', 'a']);

        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('keeps its own copy of the list', () => {
        const list = ['a'];
        backgroundClouds.setJoined(list);
        list.push('b');

        expect(backgroundClouds.getJoined()).toEqual(['a']);
    });

    it('invalidate announces without changing the list', () => {
        backgroundClouds.setJoined(['a']);
        const listener = jest.fn();
        backgroundClouds.subscribe(listener);

        backgroundClouds.invalidate();

        expect(listener).toHaveBeenCalledTimes(1);
        expect(backgroundClouds.getJoined()).toEqual(['a']);
    });

    it('stops announcing to an unsubscribed listener', () => {
        const listener = jest.fn();
        const unsubscribe = backgroundClouds.subscribe(listener);
        unsubscribe();

        backgroundClouds.invalidate();

        expect(listener).not.toHaveBeenCalled();
    });
});

describe('hasLiveJoinedSession', () => {
    beforeEach(() => {
        resetBackgroundClouds();
        mockPeekCached.mockReturnValue(null);
    });

    it('is true for a joined cloud with a usable cached entry', () => {
        backgroundClouds.setJoined(['a']);
        mockPeekCached.mockReturnValue(liveEntry);

        expect(hasLiveJoinedSession('a')).toBe(true);
    });

    it('is false for a cloud the app no longer lists, whatever is cached', () => {
        mockPeekCached.mockReturnValue(liveEntry);

        expect(hasLiveJoinedSession('a')).toBe(false);
    });

    it('is false for a joined cloud whose cached tokens are gone or incomplete', () => {
        backgroundClouds.setJoined(['a']);
        expect(hasLiveJoinedSession('a')).toBe(false);

        mockPeekCached.mockReturnValue({ ...liveEntry, delegationToken: {} });
        expect(hasLiveJoinedSession('a')).toBe(false);
    });
});
