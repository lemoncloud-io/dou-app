import type { DomainChannel } from '@chatic/data';

import {
    canStartDmFromProfile,
    channelKindOf,
    dmLineageOf,
    hasDmInviteFlow,
    isInCloudSelfSection,
    isRoomOwner,
    profilePlaceOf,
    removalActionFor,
    resolveDmPeerName,
    roomOwnerIdOf,
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

describe('isRoomOwner', () => {
    const group = { stereo: 'private', ownerId: 'u-creator' } as const;

    it('reads the join role in a group: owner owns the room', () => {
        expect(isRoomOwner(group, { stereo: 'owner', userId: 'u-1' })).toBe(true);
    });

    // A role the server set always answers — even for the creator, whose role says otherwise.
    it.each(['member', 'admin', ''])('does not own a group with role %p, creator or not', stereo => {
        expect(isRoomOwner(group, { stereo, userId: 'u-1' })).toBe(false);
        expect(isRoomOwner(group, { stereo, userId: 'u-creator' })).toBe(false);
    });

    // No role on the row: fall back to the creator so a group never loses its owner.
    it('falls back to ownerId when the join carries no role', () => {
        expect(isRoomOwner(group, { userId: 'u-creator' })).toBe(true);
        expect(isRoomOwner(group, { stereo: null, userId: 'u-creator' })).toBe(true);
        expect(isRoomOwner(group, { userId: 'u-1' })).toBe(false);
    });

    it('falls back to the given user id when there is no join row at all', () => {
        expect(isRoomOwner(group, undefined, 'u-creator')).toBe(true);
        expect(isRoomOwner(group, null, 'u-1')).toBe(false);
        expect(isRoomOwner(group, undefined)).toBe(false);
    });

    // A kick's response leaves the removed member's join in the channel's `$join`.
    it('ignores a join that names someone else, and falls back to the creator', () => {
        const kicked = { stereo: 'member', userId: 'u-kicked' };
        expect(isRoomOwner(group, kicked, 'u-creator')).toBe(true);
        expect(isRoomOwner(group, { stereo: 'owner', userId: 'u-other' }, 'u-1')).toBe(false);
    });

    // A 1:1's inviter carries `owner` on the server; the room still has no owner.
    it.each(['dm', 'self'] as const)('never names an owner in a %s room', stereo => {
        const room = { stereo, ownerId: 'u-creator' };
        expect(isRoomOwner(room, { stereo: 'owner', userId: 'u-creator' })).toBe(false);
        expect(isRoomOwner(room, undefined, 'u-creator')).toBe(false);
    });

    it('answers false while the room is not loaded', () => {
        expect(isRoomOwner(null, { stereo: 'owner', userId: 'u-1' })).toBe(false);
    });
});

describe('roomOwnerIdOf', () => {
    const group = { stereo: 'private', ownerId: 'u-creator' } as const;

    it('names the member whose role is owner, over the creator', () => {
        const joins = [
            { userId: 'u-creator', stereo: 'member' },
            { userId: 'u-2', stereo: 'owner' },
        ];
        expect(roomOwnerIdOf(group, joins)).toBe('u-2');
    });

    it('falls back to the creator while no row carries a role for them', () => {
        expect(roomOwnerIdOf(group, [])).toBe('u-creator');
        expect(roomOwnerIdOf(group, [{ userId: 'u-creator' }, { userId: 'u-2', stereo: 'member' }])).toBe('u-creator');
    });

    it('names nobody when the creator row says they are not the owner', () => {
        expect(roomOwnerIdOf(group, [{ userId: 'u-creator', stereo: 'member' }])).toBeUndefined();
    });

    it.each(['dm', 'self'] as const)('names nobody in a %s room', stereo => {
        expect(roomOwnerIdOf({ stereo, ownerId: 'u-creator' }, [{ userId: 'u-creator', stereo: 'owner' }])).toBe(
            undefined
        );
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
    const room = (fields: { stereo: string; cid: string; sid: string }) => fields as unknown as DomainChannel;

    it('names a place-scoped room by the place it lives in', () => {
        expect(profilePlaceOf(room({ stereo: 'private', cid: '1000001', sid: 'S:room' }), 'S:active')).toBe('S:room');
        expect(profilePlaceOf(room({ stereo: 'private', cid: 'default', sid: '0000' }), 'S:active')).toBe('0000');
    });

    // The relay hands the same pair-keyed room back on every re-invite, still stamped with the place
    // of the session that first opened it; home names its peer by the relay's one place.
    it("names a relay 1:1 by the reader's place, whatever place it is stamped with", () => {
        expect(profilePlaceOf(room({ stereo: 'dm', cid: 'default', sid: 'S:stamped' }), '0000')).toBe('0000');
        expect(profilePlaceOf(room({ stereo: 'dm', cid: 'default', sid: 'S:stamped' }), null)).toBeNull();
    });

    // A cloud 1:1 lives in the place it was opened in, so that place's profiles name its people.
    it('names a cloud 1:1 by the place it lives in, not the one the reader is in', () => {
        expect(profilePlaceOf(room({ stereo: 'dm', cid: '1000001', sid: 'S:opened-here' }), 'S:active')).toBe(
            'S:opened-here'
        );
    });

    it('answers the same for the same room seen from another place', () => {
        const opened = room({ stereo: 'dm', cid: '1000001', sid: 'S:opened-here' });
        expect(profilePlaceOf(opened, 'S:one')).toBe('S:opened-here');
        expect(profilePlaceOf(opened, 'S:two')).toBe('S:opened-here');
    });

    // A 1:1 from before places keyed 1:1s may carry no place, or the server's `#`.
    it("falls back to the reader's place for a room that names none", () => {
        expect(profilePlaceOf(room({ stereo: 'dm', cid: '1000001', sid: '' }), 'S:active')).toBe('S:active');
        expect(profilePlaceOf(room({ stereo: 'dm', cid: '1000001', sid: '#' }), 'S:active')).toBe('S:active');
    });

    // `null` is what the profile hooks read as "do not subscribe yet".
    it('answers null when neither side is known', () => {
        expect(profilePlaceOf(room({ stereo: 'dm', cid: '1000001', sid: '' }), null)).toBeNull();
        expect(profilePlaceOf(room({ stereo: 'dm', cid: '1000001', sid: '' }), undefined)).toBeNull();
        expect(profilePlaceOf(null, 'S:active')).toBeNull();
    });
});

describe('isInCloudSelfSection', () => {
    it('takes the cloud self chat', () => {
        expect(isInCloudSelfSection({ stereo: 'self', cid: '1000001' })).toBe(true);
    });

    // A cloud 1:1 is listed in its place's 1:1 section; the relay has one place, and its list holds the rest.
    it('leaves out a cloud 1:1, the relay 1:1 and self chat, and every group', () => {
        expect(isInCloudSelfSection({ stereo: 'dm', cid: '1000001' })).toBe(false);
        expect(isInCloudSelfSection({ stereo: 'dm', cid: 'default' })).toBe(false);
        expect(isInCloudSelfSection({ stereo: 'self', cid: 'default' })).toBe(false);
        expect(isInCloudSelfSection({ stereo: 'private', cid: '1000001' })).toBe(false);
        expect(isInCloudSelfSection(undefined)).toBe(false);
    });
});

describe('canStartDmFromProfile', () => {
    const groupRoom: Pick<DomainChannel, 'stereo' | 'cid' | 'sid'> = {
        stereo: 'private',
        cid: '1000001',
        sid: 'site-1',
    };
    const isMe = (id: string) => id === 'me';
    const base = { room: groupRoom, sessionCloudId: '1000001', sessionPlaceId: 'site-1', memberId: 'peer', isMe };

    it("offers it for another member of a cloud group room in the session's place", () => {
        expect(canStartDmFromProfile(base)).toBe(true);
        expect(canStartDmFromProfile({ ...base, room: { ...groupRoom, stereo: 'public' } })).toBe(true);
    });

    // The relay reaches a 1:1 by phone number, which a profile does not have.
    it('withholds it in a relay room', () => {
        expect(canStartDmFromProfile({ ...base, room: { ...groupRoom, cid: 'default' } })).toBe(false);
        expect(canStartDmFromProfile({ ...base, room: { ...groupRoom, cid: '' } })).toBe(false);
    });

    // A place id is unique only within its cloud; a room of the cloud being left can still be open.
    it('withholds it in a room of another cloud, even under the same place id', () => {
        expect(canStartDmFromProfile({ ...base, sessionCloudId: '1000002' })).toBe(false);
        expect(canStartDmFromProfile({ ...base, sessionCloudId: null })).toBe(false);
    });

    it('withholds it inside a 1:1 or a self chat', () => {
        expect(canStartDmFromProfile({ ...base, room: { ...groupRoom, stereo: 'dm' } })).toBe(false);
        expect(canStartDmFromProfile({ ...base, room: { ...groupRoom, stereo: 'self' } })).toBe(false);
    });

    // The 1:1 would be filed under the session's place, not the room's.
    it('withholds it in a room of another place than the session is on', () => {
        expect(canStartDmFromProfile({ ...base, sessionPlaceId: 'site-2' })).toBe(false);
        expect(canStartDmFromProfile({ ...base, sessionPlaceId: null })).toBe(false);
    });

    it('withholds it for me, a missing member, or a room not loaded yet', () => {
        expect(canStartDmFromProfile({ ...base, memberId: 'me' })).toBe(false);
        expect(canStartDmFromProfile({ ...base, memberId: '' })).toBe(false);
        expect(canStartDmFromProfile({ ...base, room: null })).toBe(false);
    });
});

describe('resolveDmPeerName', () => {
    const cloudDm = { stereo: 'dm', cid: '1000001' } as DomainChannel;
    const relayDm = { stereo: 'dm', cid: 'default' } as DomainChannel;

    it('prefers the place-profile nick on either lineage', () => {
        expect(resolveDmPeerName(cloudDm, { profileNick: 'webB', cloudName: '레인' })).toBe('webB');
        expect(resolveDmPeerName(relayDm, { profileNick: '토끼', cloudName: '레인' })).toBe('토끼');
    });

    it("falls back to a cloud 1:1 peer's cloud-profile name", () => {
        expect(resolveDmPeerName(cloudDm, { cloudName: '임마' })).toBe('임마');
    });

    it('gives a relay 1:1 no name without a place profile, so the intro stays name-free', () => {
        expect(resolveDmPeerName(relayDm, { cloudName: '임마' })).toBeUndefined();
    });

    it('gives no name when there is no peer or every name is blank', () => {
        expect(resolveDmPeerName(cloudDm, null)).toBeUndefined();
        expect(resolveDmPeerName(cloudDm, { profileNick: '  ', cloudName: ' ' })).toBeUndefined();
    });
});
