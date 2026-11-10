import { MemoryStore } from './memoryStore';
import { SwitchableStore } from './switchableStore';

describe('SwitchableStore', () => {
    it('forwards to the store it was created with until told otherwise', () => {
        const initial = new MemoryStore();
        const store = new SwitchableStore(initial);
        store.set('k', 'v');
        expect(initial.get('k')).toBe('v');
        expect(store.keys()).toEqual(['k']);
    });

    it('sends every later call to the store it was pointed at, and back on reset', () => {
        const initial = new MemoryStore();
        const next = new MemoryStore();
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
