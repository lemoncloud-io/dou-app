import { SwitchableStore } from './switchableStore';

import type { KeyValueStore } from './types';

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

describe('SwitchableStore', () => {
    it('forwards to the store it was created with until told otherwise', () => {
        const initial = mapStore();
        const store = new SwitchableStore(initial);
        store.set('k', 'v');
        expect(initial.get('k')).toBe('v');
        expect(store.keys()).toEqual(['k']);
    });

    it('sends every later call to the store it was pointed at, and back on reset', () => {
        const initial = mapStore();
        const next = mapStore();
        const store = new SwitchableStore(initial);

        store.use(next);
        store.set('k', 'v');
        expect(next.get('k')).toBe('v');
        expect(initial.get('k')).toBeNull();
        store.remove('k');
        expect(next.get('k')).toBeNull();

        store.reset();
        store.set('k2', 'v');
        expect(initial.get('k2')).toBe('v');
    });
});
