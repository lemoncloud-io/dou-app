import { sessionMedia } from '@chatic/session/store/ports';

import { PairedCloudStore, pairedClouds } from './pairedClouds';

const store = new Map<string, string>();
// One map behind both session ports — these tests are about the list, not which port holds it.
const medium = {
    get: (key: string) => store.get(key) ?? null,
    set: (key: string, value: string) => void store.set(key, value),
    remove: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    keys: () => [...store.keys()],
};
sessionMedia.configure({ secret: medium, plain: medium });

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
        let own: string | null = null;
        let ownNames: string | null = null;
        const list = new PairedCloudStore(
            {
                read: () => own,
                write: raw => void (own = raw),
                clear: () => void (own = null),
            },
            {
                read: () => ownNames,
                write: raw => void (ownNames = raw),
                clear: () => void (ownNames = null),
            }
        );
        const heard: Array<readonly string[]> = [];
        list.subscribe(ids => heard.push(ids));

        list.add('1000002');

        expect(own).toBe('["1000002"]');
        expect(pairedClouds.list()).toEqual([]);
        expect(heard).toEqual([['1000002']]);
    });
});

describe('paired cloud names', () => {
    it('keeps a name only for a cloud on the list, in its own key', () => {
        pairedClouds.setName('1000002', 'Ignored');
        expect(pairedClouds.names()).toEqual({});

        pairedClouds.add('1000002');
        pairedClouds.setName('1000002', 'Team Cloud');

        expect(pairedClouds.names()).toEqual({ '1000002': 'Team Cloud' });
        expect(JSON.parse(store.get('chatic-paired-cloud-names') ?? 'null')).toEqual({ '1000002': 'Team Cloud' });
    });

    it('drops the name with the cloud, and the key when no name is left', () => {
        pairedClouds.add('1000002');
        pairedClouds.add('1000004');
        pairedClouds.setName('1000002', 'Team Cloud');
        pairedClouds.setName('1000004', 'Other');

        pairedClouds.remove('1000002');
        expect(pairedClouds.names()).toEqual({ '1000004': 'Other' });

        pairedClouds.clear();
        expect(pairedClouds.names()).toEqual({});
        expect(store.has('chatic-paired-cloud-names')).toBe(false);
    });

    it('tells name subscribers about a name change only once, without touching the list listeners', () => {
        pairedClouds.add('1000002');
        const listListener = jest.fn();
        const namesListener = jest.fn();
        const offList = pairedClouds.subscribe(listListener);
        const offNames = pairedClouds.subscribeNames(namesListener);

        pairedClouds.setName('1000002', 'Team Cloud');
        pairedClouds.setName('1000002', 'Team Cloud');
        pairedClouds.setName('1000002', '');
        offList();
        offNames();

        expect(namesListener.mock.calls).toEqual([[{ '1000002': 'Team Cloud' }]]);
        expect(listListener).not.toHaveBeenCalled();
    });

    it('tells name subscribers when the list moves, since the names follow it', () => {
        const namesListener = jest.fn();
        const off = pairedClouds.subscribeNames(namesListener);

        pairedClouds.add('1000002');
        off();

        expect(namesListener).toHaveBeenCalledWith({});
    });

    it('reads a damaged names value as no names', () => {
        pairedClouds.add('1000002');
        store.set('chatic-paired-cloud-names', '[1,2]');
        expect(pairedClouds.names()).toEqual({});

        store.set('chatic-paired-cloud-names', JSON.stringify({ '1000002': 7 }));
        expect(pairedClouds.names()).toEqual({});
    });
});
