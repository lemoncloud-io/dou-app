import { MemoryStore } from './memoryStore';

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
