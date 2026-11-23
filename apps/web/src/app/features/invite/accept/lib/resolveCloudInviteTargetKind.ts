import type { InviteTargetKind } from '../components/InviteTargetCard';

export const resolveCloudInviteTargetKind = (info?: { channelId?: string | null } | null): InviteTargetKind =>
    info && !info.channelId ? 'place' : 'group';
