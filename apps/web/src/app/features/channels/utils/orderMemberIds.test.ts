import { orderMemberIdsOwnerFirst } from './orderMemberIds';

describe('orderMemberIdsOwnerFirst', () => {
    it('pins the owner to the front, keeping the rest in order', () => {
        expect(orderMemberIdsOwnerFirst('owner', ['a', 'owner', 'b', 'c'], 5)).toEqual(['owner', 'a', 'b', 'c']);
    });

    it('does not duplicate the owner when it also appears in the member list', () => {
        expect(orderMemberIdsOwnerFirst('owner', ['owner', 'a'], 5)).toEqual(['owner', 'a']);
    });

    it('removes duplicate member ids', () => {
        expect(orderMemberIdsOwnerFirst('owner', ['a', 'a', 'b'], 5)).toEqual(['owner', 'a', 'b']);
    });

    it('caps the result at `max`', () => {
        expect(orderMemberIdsOwnerFirst('owner', ['a', 'b', 'c', 'd', 'e', 'f'], 5)).toEqual([
            'owner',
            'a',
            'b',
            'c',
            'd',
        ]);
    });

    it('includes the owner even when absent from the member list', () => {
        expect(orderMemberIdsOwnerFirst('owner', ['a', 'b'], 5)).toEqual(['owner', 'a', 'b']);
    });

    it('handles a missing owner id (falls back to member order)', () => {
        expect(orderMemberIdsOwnerFirst(undefined, ['a', 'b'], 5)).toEqual(['a', 'b']);
    });

    it('ignores falsy member ids', () => {
        expect(orderMemberIdsOwnerFirst('owner', ['', 'a'], 5)).toEqual(['owner', 'a']);
    });
});
