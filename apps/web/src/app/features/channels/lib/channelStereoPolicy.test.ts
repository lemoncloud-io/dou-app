import {
    channelKindOf,
    dmLineageOf,
    hasDmInviteFlow,
    profilePlaceOf,
    removalActionFor,
    showsMemberCount,
} from './channelStereoPolicy';

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

describe('dmLineageOf', () => {
    it('reads a 1:1 in the relay cloud as relay', () => {
        expect(dmLineageOf({ stereo: 'dm', cid: 'default' })).toBe('relay');
    });

    it('reads a 1:1 in any other cloud as cloud', () => {
        expect(dmLineageOf({ stereo: 'dm', cid: '1000001' })).toBe('cloud');
    });

    // The axis used to be `sid`, which the server overwrites and which means two things at once.
    // `cid` is the server's own answer to "which cloud", and nothing on the client derives it.
    it('does not change with whatever place the room carries', () => {
        expect(dmLineageOf({ stereo: 'dm', cid: '1000001', sid: 'S:somewhere' } as never)).toBe('cloud');
        expect(dmLineageOf({ stereo: 'dm', cid: '1000001', sid: '' } as never)).toBe('cloud');
    });

    it('declines to answer for anything that is not a 1:1', () => {
        expect(dmLineageOf({ stereo: 'private', cid: '1000001' })).toBeUndefined();
        expect(dmLineageOf({ stereo: 'self', cid: 'default' })).toBeUndefined();
        expect(dmLineageOf(null)).toBeUndefined();
        expect(dmLineageOf(undefined)).toBeUndefined();
    });
});

describe('hasDmInviteFlow', () => {
    it('is true only for a relay 1:1', () => {
        expect(hasDmInviteFlow({ stereo: 'dm', cid: 'default' })).toBe(true);
    });

    // The whole point: a cloud 1:1 has no invite to re-send, so the footer and its CTA stay away.
    it('is false for a cloud 1:1', () => {
        expect(hasDmInviteFlow({ stereo: 'dm', cid: '1000001' })).toBe(false);
    });

    it('is false for a group, a self chat and an absent row', () => {
        expect(hasDmInviteFlow({ stereo: 'private', cid: 'default' })).toBe(false);
        expect(hasDmInviteFlow({ stereo: 'self', cid: 'default' })).toBe(false);
        expect(hasDmInviteFlow(null)).toBe(false);
    });
});

describe('profilePlaceOf', () => {
    it('names a place-scoped room by the place it lives in', () => {
        expect(profilePlaceOf({ stereo: 'dm', cid: 'default', sid: 'S:relay' }, 'S:active')).toBe('S:relay');
        expect(profilePlaceOf({ stereo: 'private', cid: '1000001', sid: 'S:room' }, 'S:active')).toBe('S:room');
    });

    // A cloud 1:1's own `sid` is where its creator stood, which is no answer for the other person.
    it('names a cloud 1:1 by the place the reader is standing in, not the one it carries', () => {
        expect(profilePlaceOf({ stereo: 'dm', cid: '1000001', sid: 'S:creator-was-here' }, 'S:active')).toBe(
            'S:active'
        );
    });

    it('answers differently for the same room seen from another place', () => {
        const room = { stereo: 'dm', cid: '1000001', sid: 'S:creator-was-here' } as const;
        expect(profilePlaceOf(room, 'S:one')).toBe('S:one');
        expect(profilePlaceOf(room, 'S:two')).toBe('S:two');
    });

    // `null` is what the profile hooks read as "do not subscribe yet".
    it('answers null when neither side is known', () => {
        expect(profilePlaceOf({ stereo: 'dm', cid: '1000001', sid: '' }, null)).toBeNull();
        expect(profilePlaceOf({ stereo: 'dm', cid: '1000001', sid: '' }, undefined)).toBeNull();
        expect(profilePlaceOf(null, 'S:active')).toBeNull();
    });
});
