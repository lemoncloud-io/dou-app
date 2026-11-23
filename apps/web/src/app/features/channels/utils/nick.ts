const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isRawIdNick = (nick: string, selfUserId?: string | null): boolean =>
    (!!selfUserId && nick === selfUserId) || UUID_PATTERN.test(nick);

const GENERATED_ACCOUNT_NAME_PATTERN = /^(?:user[_-]?\d{2,}|\*{2,}\d{2,})$/i;

export const isServerSeededNick = (nick: string, selfUserId?: string | null): boolean =>
    isRawIdNick(nick, selfUserId) || GENERATED_ACCOUNT_NAME_PATTERN.test(nick);

export const customJoinNick = (nick: string | null | undefined, selfUserId?: string | null): string | undefined => {
    const trimmed = nick?.trim();
    if (!trimmed || isServerSeededNick(trimmed, selfUserId)) return undefined;
    return trimmed;
};
