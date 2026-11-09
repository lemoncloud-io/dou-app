import { MemoryMedium } from './memoryMedium';
import { SwitchableMedium } from './switchableMedium';

describe('SwitchableMedium', () => {
    it('forwards to the medium it was created with until told otherwise', () => {
        const initial = new MemoryMedium();
        const medium = new SwitchableMedium(initial);
        medium.set('k', 'v');
        expect(initial.get('k')).toBe('v');
        expect(medium.keys()).toEqual(['k']);
    });

    it('sends every later call to the medium it was pointed at, and back on reset', () => {
        const initial = new MemoryMedium();
        const next = new MemoryMedium();
        const medium = new SwitchableMedium(initial);

        medium.use(next);
        medium.set('k', 'v');
        expect(next.get('k')).toBe('v');
        expect(initial.get('k')).toBeNull();
        medium.remove('k');
        expect(next.get('k')).toBeNull();

        medium.reset();
        medium.set('k2', 'v');
        expect(initial.get('k2')).toBe('v');
    });
});
