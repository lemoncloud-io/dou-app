/** Deterministic hue (0–359) from a string — same id always maps to the same color. */
export const hueFromString = (value: string): number => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) % 360;
    return hash;
};

/**
 * Inline style for a per-identity avatar. Hue varies per user; lightness and
 * foreground come from theme tokens (`--avatar-l`/`--avatar-fg`) so contrast
 * holds in both light and dark mode instead of a hardcoded white-on-45%.
 */
export const avatarStyle = (value: string): { backgroundColor: string; color: string } => ({
    backgroundColor: `hsl(${hueFromString(value)} 42% var(--avatar-l))`,
    color: `hsl(var(--avatar-fg))`,
});
