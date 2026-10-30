import { setStorageAdapter } from '@chatic/shared';

import { PairedCloudStore, pairedClouds } from './pairedClouds';

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

describe('PairedCloudStore', () => {
    it('can be subscribed to through a detached subscribe, as useSyncExternalStore passes it', () => {
        const { subscribe } = pairedClouds;
        const heard: Array<readonly string[]> = [];

        const off = subscribe(ids => heard.push(ids));
        pairedClouds.add('1000002');
        off();
        pairedClouds.add('1000004');

        expect(heard).toEqual([['1000002']]);
    });

    it('keeps its list in the storage it was given, apart from the shared instance', () => {
        const own = new Map<string, string>();
        const list = new PairedCloudStore({
            get: key => own.get(key) ?? null,
            set: (key, value) => void own.set(key, value),
            remove: key => void own.delete(key),
        });
        const heard: Array<readonly string[]> = [];
        list.subscribe(ids => heard.push(ids));

        list.add('1000002');

        expect(own.get('chatic-paired-cloud-ids')).toBe('["1000002"]');
        expect(pairedClouds.list()).toEqual([]);
        expect(heard).toEqual([['1000002']]);
    });
});
