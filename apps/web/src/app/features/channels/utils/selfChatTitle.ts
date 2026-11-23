import { customJoinNick } from './nick';

export const resolveSelfChatTitle = (
    nick: string | null | undefined,
    siteProfileNick: string | null | undefined,
    fallbackLabel: string,
    selfUserId?: string | null
): string => {
    return customJoinNick(nick, selfUserId) ?? (siteProfileNick?.trim() || fallbackLabel);
};
