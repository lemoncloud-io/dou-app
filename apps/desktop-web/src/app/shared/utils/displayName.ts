/**
 * Canonical display name for a user-like record: real name, then nickname, then
 * the raw id as a last resort. Shared so member rows, the member filter, and the
 * message author header all resolve names the same way.
 */
export const displayName = (user: { name?: string; nick?: string; id: string }): string =>
    user.name ?? user.nick ?? user.id;
