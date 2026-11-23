import { customJoinNick } from './nick';

export interface ResolveDmTitleInput {
    joinNick?: string | null;
    peerNick?: string | null;
    channelName?: string | null;
    unnamedLabel: string;
    selfUserId?: string | null;
}

export const resolveDmTitle = ({
    joinNick,
    peerNick,
    channelName,
    unnamedLabel,
    selfUserId,
}: ResolveDmTitleInput): string => {
    return customJoinNick(joinNick, selfUserId) ?? (peerNick?.trim() || channelName?.trim() || unnamedLabel);
};
