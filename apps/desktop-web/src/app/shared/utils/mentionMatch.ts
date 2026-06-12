/** Group tokens that mention everyone in the channel (Slack convention). */
export const GROUP_MENTIONS = ['@channel', '@here', '@everyone'];

/**
 * Best-effort "does this message mention me" check, used by the
 * notify='mention' channel mode. Plain case-insensitive substring match on
 * `@<name>` (names can contain spaces, unlike the composer's token regex), so
 * it errs toward notifying rather than staying silent.
 */
export const isMentioned = (content: string, names: Array<string | null | undefined>): boolean => {
    if (!content.includes('@')) return false;
    const lower = content.toLowerCase();
    if (GROUP_MENTIONS.some(group => lower.includes(group))) return true;
    return names.some(raw => {
        const name = raw?.trim().toLowerCase();
        return !!name && lower.includes(`@${name}`);
    });
};
