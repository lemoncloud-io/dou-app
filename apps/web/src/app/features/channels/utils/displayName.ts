import { isRawIdNick } from './nick';

interface ProfileLike {
    nick?: string;
}

interface MemberLike {
    nick?: string;
    name?: string;
}

export interface DisplayNameSources {
    profileMap: Map<string, ProfileLike>;
    memberById: Map<string, MemberLike>;
    userId?: string | null;
    unknownLabel: string;
    meLabel: string;
}

const asName = (value: string | undefined, id: string): string | undefined => {
    const trimmed = value?.trim();
    if (!trimmed || isRawIdNick(trimmed, id)) return undefined;
    return trimmed;
};

const fallbackFor = (id: string, sources: DisplayNameSources): string =>
    sources.userId && id === sources.userId ? sources.meLabel : sources.unknownLabel;

export const resolveUserName = (id: string, sources: DisplayNameSources): string => {
    if (!id) return sources.unknownLabel;
    const profile = sources.profileMap.get(id);
    const member = sources.memberById.get(id);
    return (
        asName(profile?.nick, id) ?? asName(member?.nick, id) ?? asName(member?.name, id) ?? fallbackFor(id, sources)
    );
};

interface ChatLike {
    ownerId?: string;
    owner$?: { name?: string };
}

export const resolveChatOwnerName = (chat: ChatLike, sources: DisplayNameSources): string => {
    const id = chat.ownerId ?? '';
    const embedded = asName(chat.owner$?.name, id);
    if (!id) return embedded ?? sources.unknownLabel;
    const profile = sources.profileMap.get(id);
    const member = sources.memberById.get(id);
    return (
        asName(profile?.nick, id) ??
        asName(member?.nick, id) ??
        asName(member?.name, id) ??
        embedded ??
        fallbackFor(id, sources)
    );
};
