import { MemoryMedium } from './memoryMedium';

describe('MemoryMedium', () => {
    it('keeps values for the page lifetime and lists its keys', () => {
        const medium = new MemoryMedium();
        medium.set('a', '1');
        medium.set('b', '2');
        medium.remove('a');

        expect(medium.get('a')).toBeNull();
        expect(medium.get('b')).toBe('2');
        expect(medium.keys()).toEqual(['b']);
    });

    it('starts empty in every instance', () => {
        new MemoryMedium().set('a', '1');
        expect(new MemoryMedium().get('a')).toBeNull();
    });

    it('empties every key on clear', () => {
        const medium = new MemoryMedium();
        medium.set('a', '1');
        medium.clear();
        expect(medium.keys()).toEqual([]);
    });
});
