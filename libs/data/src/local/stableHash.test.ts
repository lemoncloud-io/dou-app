import { stableHash } from './stableHash';

/**
 * The stream-key builder for the v2 local data sources: the same scope and query must land on one
 * key, and two different queries must never share one. A collision here does not throw — it hands a
 * subscriber somebody else's stream — so these tests pin each property the key rests on separately.
 */
describe('stableHash', () => {
    it('ignores key order — one scope written two ways is one key', () => {
        expect(stableHash({ cid: 'cloud-a', uid: 'user-1' })).toBe(stableHash({ uid: 'user-1', cid: 'cloud-a' }));
    });

    it('drops undefined fields, so an unset field equals an absent one', () => {
        expect(stableHash({ cid: 'cloud-a', sid: undefined })).toBe(stableHash({ cid: 'cloud-a' }));
    });

    it('keeps null — it is a value, not an absent field', () => {
        expect(stableHash({ cursorNo: null })).toBe('{"cursorNo":null}');
        expect(stableHash({ cursorNo: null })).not.toBe(stableHash({}));
    });

    it('sorts nested objects too', () => {
        expect(stableHash({ query: { limit: 20, channelId: 'ch-1' }, cid: 'cloud-a' })).toBe(
            stableHash({ cid: 'cloud-a', query: { channelId: 'ch-1', limit: 20 } })
        );
    });

    it('preserves array order — a reordered list is a different query', () => {
        expect(stableHash({ ids: ['a', 'b'] })).not.toBe(stableHash({ ids: ['b', 'a'] }));
    });

    it('sorts objects sitting inside an array', () => {
        expect(stableHash([{ id: 'a', no: 1 }])).toBe(stableHash([{ no: 1, id: 'a' }]));
    });

    it('separates scopes that differ in a single field', () => {
        const keys = [
            stableHash({ cid: 'cloud-a', uid: 'user-1' }),
            stableHash({ cid: 'cloud-b', uid: 'user-1' }),
            stableHash({ cid: 'cloud-a', uid: 'user-2' }),
        ];

        expect(new Set(keys).size).toBe(3);
    });

    it('does not confuse a number with its string form', () => {
        expect(stableHash({ chatNo: 7 })).not.toBe(stableHash({ chatNo: '7' }));
    });

    // Documented, not endorsed. The signature promises `string`, but `JSON.stringify(undefined)` is
    // `undefined`. Every caller today passes an object literal (`getScopeKey`,
    // `createListObserverKey`), so nothing reaches this — the test is here so that a caller which
    // starts passing a bare value has to come change this line on purpose.
    it('returns undefined for a bare undefined, despite the string signature', () => {
        expect(stableHash(undefined)).toBeUndefined();
    });
});
