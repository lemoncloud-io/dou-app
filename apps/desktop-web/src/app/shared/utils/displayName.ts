const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isPlaceholderName = (name?: string): boolean => {
    const trimmed = name?.trim();
    return !trimmed || UUID_RE.test(trimmed);
};

export const displayName = (user: { name?: string; nick?: string; id: string }): string => {
    const name = isPlaceholderName(user.name) ? undefined : user.name;
    return name ?? user.nick ?? user.id;
};
