import { setStorageAdapter } from '@chatic/shared';

import { pairedClouds } from './pairedClouds';

const store = new Map<string, string>();
setStorageAdapter({
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: key => void store.delete(key),
});

beforeEach(() => store.clear());

describe('pairedClouds', () => {
    it('remembers each cloud once, in the order it was approved', () => {
        pairedClouds.add('1000002');
        pairedClouds.add('1000004');
        pairedClouds.add('1000002');

        expect(pairedClouds.list()).toEqual(['1000002', '1000004']);
        expect(pairedClouds.has('1000004')).toBe(true);
    });

    it('forgets one cloud, and drops the key when none is left', () => {
        pairedClouds.add('1000002');
        pairedClouds.add('1000004');

        pairedClouds.remove('1000002');
        expect(pairedClouds.list()).toEqual(['1000004']);

        pairedClouds.remove('1000004');
        expect(store.has('chatic-paired-cloud-ids')).toBe(false);
    });

    it('reads a damaged value as no clouds', () => {
        store.set('chatic-paired-cloud-ids', '{not json');
        expect(pairedClouds.list()).toEqual([]);

        store.set('chatic-paired-cloud-ids', JSON.stringify(['1000002', 7, '']));
        expect(pairedClouds.list()).toEqual(['1000002']);
    });

    it('tells subscribers about every change, and stops when they unsubscribe', () => {
        const listener = jest.fn();
        const off = pairedClouds.subscribe(listener);

        pairedClouds.add('1000002');
        pairedClouds.clear();
        off();
        pairedClouds.add('1000004');

        expect(listener.mock.calls).toEqual([[['1000002']], [[]]]);
    });
});
