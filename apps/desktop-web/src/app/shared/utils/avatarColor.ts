const hueFromString = (value: string): number => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) % 360;
    return hash;
};

export const avatarStyle = (value: string): { backgroundColor: string; color: string } => ({
    backgroundColor: `hsl(${hueFromString(value)} 42% var(--avatar-l))`,
    color: `hsl(var(--avatar-fg))`,
});
