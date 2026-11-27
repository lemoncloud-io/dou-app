import { asDomStorage } from './asDomStorage.mapper';

import type { KeyValueStore } from '../types';

const mapStore = (): KeyValueStore => {
    const values = new Map<string, string>();
    return {
        get: key => values.get(key) ?? null,
        set: (key, value) => {
            values.set(key, value);
        },
        remove: key => {
            values.delete(key);
        },
        clear: () => {
            values.clear();
        },
        keys: () => [...values.keys()],
    };
};

describe('asDomStorage', () => {
    it('exposes length, key() and the item methods over the store', () => {
        const store = mapStore();
        const dom = asDomStorage(store);
        dom.setItem('a', '1');
        dom.setItem('b', '2');

        expect(dom.length).toBe(2);
        expect([dom.key(0), dom.key(1)]).toEqual(['a', 'b']);
        expect(dom.key(2)).toBeNull();
        expect(dom.getItem('b')).toBe('2');
        expect(store.get('a')).toBe('1');
    });

    it('reflects writes made on the store between calls', () => {
        const store = mapStore();
        const dom = asDomStorage(store);
        store.set('a', '1');
        expect(dom.length).toBe(1);
        dom.removeItem('a');
        expect(store.get('a')).toBeNull();
    });

    it('empties the store on clear', () => {
        const store = mapStore();
        store.set('a', '1');
        asDomStorage(store).clear();
        expect(store.keys()).toEqual([]);
    });

    it('stores a non-string value as its string form, as localStorage does', () => {
        const dom = asDomStorage(mapStore());
        dom.setItem('n', 42 as unknown as string);
        expect(dom.getItem('n')).toBe('42');
    });
});
