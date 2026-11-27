import { TolerantStore } from './tolerantStore';

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

const throwing = (): KeyValueStore => ({
    get: () => {
        throw new Error('blocked');
    },
    set: () => {
        throw new Error('quota');
    },
    remove: () => {
        throw new Error('blocked');
    },
    clear: () => {
        throw new Error('blocked');
    },
    keys: () => {
        throw new Error('blocked');
    },
});

describe('TolerantStore', () => {
    it('passes every call through to the store it wraps', () => {
        const inner = mapStore();
        const store = new TolerantStore(inner);
        store.set('k', 'v');
        expect(inner.get('k')).toBe('v');
        expect(store.get('k')).toBe('v');
        expect(store.keys()).toEqual(['k']);
        store.remove('k');
        expect(inner.get('k')).toBeNull();
    });

    it('answers a failed read as absent and a failed listing as empty', () => {
        const store = new TolerantStore(throwing());
        expect(store.get('k')).toBeNull();
        expect(store.keys()).toEqual([]);
    });

    it('swallows a failed write, remove and clear', () => {
        const store = new TolerantStore(throwing());
        expect(() => store.set('k', 'v')).not.toThrow();
        expect(() => store.remove('k')).not.toThrow();
        expect(() => store.clear()).not.toThrow();
    });
});
