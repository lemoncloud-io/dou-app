import { shareStructure } from './shareStructure';

describe('shareStructure', () => {
    it('answers the previous value itself when nothing changed', () => {
        const previous = { a: { b: [1, { c: 'x' }] }, d: null };
        expect(shareStructure(previous, JSON.parse(JSON.stringify(previous)))).toBe(previous);
    });

    it('keeps each unchanged part and replaces only the path that changed', () => {
        const previous = { relay: { id: 'r' }, cloud: { id: 'c', sites: ['s1'] }, list: [{ n: 1 }, { n: 2 }] };
        const next = { relay: { id: 'r' }, cloud: { id: 'c', sites: ['s1', 's2'] }, list: [{ n: 1 }, { n: 3 }] };
        const shared = shareStructure(previous, next);
        expect(shared).toEqual(next);
        expect(shared).not.toBe(previous);
        expect(shared.relay).toBe(previous.relay);
        expect(shared.cloud).not.toBe(previous.cloud);
        expect(shared.list[0]).toBe(previous.list[0]);
        expect(shared.list[1]).not.toBe(previous.list[1]);
    });

    it('sees a key added or removed as a change', () => {
        const previous: Record<string, unknown> = { a: 1 };
        expect(shareStructure(previous, { a: 1, b: undefined })).not.toBe(previous);
        expect(shareStructure({ a: 1, b: 2 } as Record<string, unknown>, { a: 1 })).toEqual({ a: 1 });
    });

    it('takes the new value when the shape changed', () => {
        expect(shareStructure<unknown>([1], { 0: 1 })).toEqual({ 0: 1 });
        expect(shareStructure<unknown>({ a: 1 }, null)).toBeNull();
    });
});
