import { resolveCloudInviteTargetKind } from './resolveCloudInviteTargetKind';

describe('resolveCloudInviteTargetKind', () => {
    it('reads an invite that names a room as a group invite', () => {
        expect(resolveCloudInviteTargetKind({ channelId: 'ch-1' })).toBe('group');
    });

    it('reads an invite with no room as a place invite — the server answers an empty string', () => {
        expect(resolveCloudInviteTargetKind({ channelId: '' })).toBe('place');
        expect(resolveCloudInviteTargetKind({})).toBe('place');
    });

    it('keeps the group default while the invite metadata has not arrived', () => {
        expect(resolveCloudInviteTargetKind(undefined)).toBe('group');
        expect(resolveCloudInviteTargetKind(null)).toBe('group');
    });
});
