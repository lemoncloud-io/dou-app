import type { InviteTargetKind } from '../components/InviteTargetCard';

/**
 * What a cloud invite joins, read off its metadata. An invite issued without a room (the owner's
 * "invite to place") comes back with an empty `channelId`, and accepting it lands in the place with no
 * room — so it must not be captioned as a group chat. Until the metadata arrives the screen keeps the
 * group default rather than flashing a place caption that may be wrong.
 */
export const resolveCloudInviteTargetKind = (info?: { channelId?: string | null } | null): InviteTargetKind =>
    info && !info.channelId ? 'place' : 'group';
