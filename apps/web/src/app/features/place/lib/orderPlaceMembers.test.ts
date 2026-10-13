import { orderPlaceMembers } from './orderPlaceMembers';

const member = (id: string, isOwner?: boolean) => ({ id, cid: 'cloud-a', isOwner });

describe('orderPlaceMembers', () => {
    it('puts the owner first, me second and keeps the server order for the rest', () => {
        const ordered = orderPlaceMembers(
            [member('b'), member('me'), member('c'), member('owner', true), member('a')],
            id => id === 'me'
        );

        expect(ordered.map(m => m.id)).toEqual(['owner', 'me', 'b', 'c', 'a']);
    });

    it('puts me first when I am the owner, and leaves the input untouched', () => {
        const input = [member('b'), member('me', true)];

        expect(orderPlaceMembers(input, id => id === 'me').map(m => m.id)).toEqual(['me', 'b']);
        expect(input.map(m => m.id)).toEqual(['b', 'me']);
    });
});
