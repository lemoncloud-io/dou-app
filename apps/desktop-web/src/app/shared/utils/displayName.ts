/** Auto-generated guest usernames are a bare UUID — not something to show a user. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when a name is a placeholder (blank or a raw UUID) rather than a real name. */
export const isPlaceholderName = (name?: string): boolean => {
    const trimmed = name?.trim();
    return !trimmed || UUID_RE.test(trimmed);
};

/**
 * Canonical display name for a user-like record: real name, then nickname, then
 * the raw id as a last resort. Shared so member rows, the member filter, and the
 * message author header all resolve names the same way. A UUID-style auto name
 * (guest accounts) is treated as no name so it never shows as a label.
 */
export const displayName = (user: { name?: string; nick?: string; id: string }): string => {
    const name = isPlaceholderName(user.name) ? undefined : user.name;
    return name ?? user.nick ?? user.id;
};
