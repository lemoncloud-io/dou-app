import { memoryStore, memoryStoragePorts } from '.';

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

        expect(ports.secret.get('k')).toBe('secret');
        expect(ports.plain.get('k')).toBe('plain');
        expect(ports.device.get('k')).toBeNull();
    });
});
