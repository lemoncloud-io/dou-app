import { appendPersistentId, MAX_PERSISTENT_IDS, parseSavedCreds } from './fcmCreds';

const ids = (count: number, from = 0): string[] => Array.from({ length: count }, (_, i) => `id-${from + i}`);

describe('appendPersistentId', () => {
    it('appends the new id after the existing ones', () => {
        expect(appendPersistentId(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    });

    it('drops the oldest ids once the cap is exceeded', () => {
        const next = appendPersistentId(ids(MAX_PERSISTENT_IDS), 'newest');
        expect(next).toHaveLength(MAX_PERSISTENT_IDS);
        expect(next[0]).toBe('id-1');
        expect(next[next.length - 1]).toBe('newest');
    });

    it('does not repeat an id it already holds', () => {
        expect(appendPersistentId(['a', 'b'], 'a')).toEqual(['a', 'b']);
    });

    it('does not mutate the list it was given', () => {
        const current = ['a'];
        appendPersistentId(current, 'b');
        expect(current).toEqual(['a']);
    });
});

describe('parseSavedCreds', () => {
    const base = { androidId: '1', securityToken: '2', token: 't' };

    it('reads a current creds file as is', () => {
        expect(parseSavedCreds(JSON.stringify({ ...base, persistentIds: ['a'] }))).toEqual({
            ...base,
            persistentIds: ['a'],
        });
    });

    it('treats a file written before persistentIds existed as an empty list', () => {
        expect(parseSavedCreds(JSON.stringify(base))?.persistentIds).toEqual([]);
    });

    it('treats a non-array persistentIds as an empty list', () => {
        expect(parseSavedCreds(JSON.stringify({ ...base, persistentIds: 'oops' }))?.persistentIds).toEqual([]);
    });

    it('keeps only string entries', () => {
        expect(parseSavedCreds(JSON.stringify({ ...base, persistentIds: ['a', 1, null, 'b'] }))?.persistentIds).toEqual(
            ['a', 'b']
        );
    });

    it('trims a file that already grew past the cap to the most recent ids', () => {
        const parsed = parseSavedCreds(JSON.stringify({ ...base, persistentIds: ids(MAX_PERSISTENT_IDS + 50) }));
        expect(parsed?.persistentIds).toEqual(ids(MAX_PERSISTENT_IDS, 50));
    });

    it('returns null for text that is not a creds object', () => {
        expect(parseSavedCreds('not json')).toBeNull();
        expect(parseSavedCreds('null')).toBeNull();
        expect(parseSavedCreds('[]')).toBeNull();
    });
});
