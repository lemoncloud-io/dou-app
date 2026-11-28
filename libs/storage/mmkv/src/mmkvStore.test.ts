import { mmkvStore } from './mmkvStore';
import type { MmkvFile } from './mmkvStore';

const fileWith = (initial: Record<string, string>): MmkvFile => {
    const values = new Map(Object.entries(initial));
    return {
        getString: key => values.get(key),
        set: (key, value) => {
            values.set(key, value);
        },
        remove: key => values.delete(key),
        clearAll: () => values.clear(),
        getAllKeys: () => [...values.keys()],
    };
};

describe('mmkvStore', () => {
    it('reads and writes strings on the file it is given', () => {
        const store = mmkvStore(fileWith({ token: 'a' }));

        expect(store.get('token')).toBe('a');
        expect(store.get('missing')).toBeNull();

        store.set('user', 'b');
        store.remove('token');

        expect(store.keys()).toEqual(['user']);
        expect(store.get('user')).toBe('b');
    });

    it('clears the whole file', () => {
        const store = mmkvStore(fileWith({ a: '1', b: '2' }));

        store.clear();

        expect(store.keys()).toEqual([]);
    });
});
