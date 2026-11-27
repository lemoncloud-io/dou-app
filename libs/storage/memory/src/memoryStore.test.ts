import { MemoryStore, memoryStore, memoryStoragePorts } from '.';

describe('MemoryStore', () => {
    it('keeps values for the page lifetime and lists its keys', () => {
        const store = new MemoryStore();
        store.set('a', '1');
        store.set('b', '2');
        store.remove('a');

        expect(store.get('a')).toBeNull();
        expect(store.get('b')).toBe('2');
        expect(store.keys()).toEqual(['b']);
    });

    it('starts empty in every instance', () => {
        new MemoryStore().set('a', '1');
        expect(new MemoryStore().get('a')).toBeNull();
    });

    it('empties every key on clear', () => {
        const store = new MemoryStore();
        store.set('a', '1');
        store.clear();
        expect(store.keys()).toEqual([]);
    });
});

describe('memoryStore', () => {
    it('keeps what is set until it is removed or cleared', () => {
        const store = memoryStore();

        store.set('a', '1');
        store.set('b', '2');
        store.set('a', '3');
        expect(store.get('a')).toBe('3');
        expect(store.keys()).toEqual(['a', 'b']);

        store.remove('a');
        expect(store.get('a')).toBeNull();

        store.clear();
        expect(store.keys()).toEqual([]);
    });

    it('gives each storage role its own store', () => {
        const ports = memoryStoragePorts();

        ports.secret.set('k', 'secret');
        ports.plain.set('k', 'plain');
        ports.tab.set('k', 'tab');

        expect(ports.secret.get('k')).toBe('secret');
        expect(ports.plain.get('k')).toBe('plain');
        expect(ports.tab.get('k')).toBe('tab');
        expect(ports.device.get('k')).toBeNull();
    });
});
