import { channelKindOf, removalActionFor, showsMemberCount } from './channelStereoPolicy';

describe('channelKindOf', () => {
    it('names the two kinds that have a stereo of their own', () => {
        expect(channelKindOf('self')).toBe('self');
        expect(channelKindOf('dm')).toBe('dm');
    });

    // The point of the switch: these three are folded deliberately, not by a negative test.
    it.each(['public', 'private', '', undefined] as const)('folds %p into group', stereo => {
        expect(channelKindOf(stereo)).toBe('group');
    });

    // A stereo no build knows: a list must still render, so the fallback is group rather than a
    // throw. The compile-time guard (`never`) is what actually catches a new value.
    it('falls back to group for an unknown stereo', () => {
        expect(channelKindOf('brand-new' as never)).toBe('group');
    });
});

describe('showsMemberCount', () => {
    it('shows the count only for a group', () => {
        expect(showsMemberCount('group')).toBe(true);
    });

    // Self is always 1 and DM is always 2 — neither number tells the reader anything.
    it.each(['self', 'dm'] as const)('hides the count for %s', kind => {
        expect(showsMemberCount(kind)).toBe(false);
    });
});

describe('removalActionFor', () => {
    // The rule this whole module exists for: a 1:1 leaves, full stop. Being the inviter
    // (`channel.ownerId === uid`) is a by-product of creation, not a permission to erase the room
    // the other side still needs for a re-invite.
    it.each([true, false])('leaves a DM whether or not I am the owner (isOwner=%p)', isOwner => {
        expect(removalActionFor('dm', isOwner)).toBe('leave');
    });

    it('lets a group owner delete and a group member leave', () => {
        expect(removalActionFor('group', true)).toBe('delete');
        expect(removalActionFor('group', false)).toBe('leave');
    });

    it('offers nothing for a self chat', () => {
        expect(removalActionFor('self', true)).toBe('none');
        expect(removalActionFor('self', false)).toBe('none');
    });
});
