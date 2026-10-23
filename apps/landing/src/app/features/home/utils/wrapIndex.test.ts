import { wrapIndex } from './wrapIndex';

describe('wrapIndex', () => {
    it('steps forward inside the list', () => {
        expect(wrapIndex(1, 1, 4)).toBe(2);
    });

    it('wraps from the last item to the first', () => {
        expect(wrapIndex(3, 1, 4)).toBe(0);
    });

    it('wraps from the first item back to the last', () => {
        expect(wrapIndex(0, -1, 4)).toBe(3);
    });

    it('stays at zero for an empty list instead of returning NaN', () => {
        expect(wrapIndex(0, 1, 0)).toBe(0);
    });
});
