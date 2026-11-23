import type { ChatSubType, DomainChat } from '@chatic/runtime';

export type SystemMessageText = { kind: 'i18n'; key: string; name: string } | { kind: 'raw'; text: string };

const SUFFIX_KEYS: Partial<Record<ChatSubType, string>> = {
    join: 'chat.system.join',
    leave: 'chat.system.leave',
};

export const systemMessageText = (chat: DomainChat, authorName: string): SystemMessageText | null => {
    const key = chat.subType ? SUFFIX_KEYS[chat.subType] : undefined;
    const name = authorName.trim();
    if (key && name) return { kind: 'i18n', key, name };
    const text = chat.content?.trim();
    return text ? { kind: 'raw', text } : null;
};

const MAX_LISTED_JOINS = 3;

export const groupedJoinText = (names: readonly string[]): { key: string; params: Record<string, string | number> } => {
    const [a, b, c] = names;
    if (names.length === 2) return { key: 'chat.system.joinGroup2', params: { a, b } };
    if (names.length <= MAX_LISTED_JOINS) return { key: 'chat.system.joinGroup3', params: { a, b, c } };
    return { key: 'chat.system.joinGroupMany', params: { a, b, count: names.length - 2 } };
};
