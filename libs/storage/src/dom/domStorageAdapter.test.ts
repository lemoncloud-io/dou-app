import { asDomStorage } from './asDomStorage.mapper';
import { MemoryMedium } from '../media/memoryMedium';

describe('asDomStorage', () => {
    it('exposes length, key() and the item methods over the medium', () => {
        const medium = new MemoryMedium();
        const dom = asDomStorage(medium);
        dom.setItem('a', '1');
        dom.setItem('b', '2');

        expect(dom.length).toBe(2);
        expect([dom.key(0), dom.key(1)]).toEqual(['a', 'b']);
        expect(dom.key(2)).toBeNull();
        expect(dom.getItem('b')).toBe('2');
        expect(medium.get('a')).toBe('1');
    });

    it('reflects writes made on the medium between calls', () => {
        const medium = new MemoryMedium();
        const dom = asDomStorage(medium);
        medium.set('a', '1');
        expect(dom.length).toBe(1);
        dom.removeItem('a');
        expect(medium.get('a')).toBeNull();
    });

    it('empties the medium on clear', () => {
        const medium = new MemoryMedium();
        medium.set('a', '1');
        asDomStorage(medium).clear();
        expect(medium.keys()).toEqual([]);
    });

    it('stores a non-string value as its string form, as localStorage does', () => {
        const dom = asDomStorage(new MemoryMedium());
        dom.setItem('n', 42 as unknown as string);
        expect(dom.getItem('n')).toBe('42');
    });
});
