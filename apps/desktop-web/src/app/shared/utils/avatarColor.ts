/** Deterministic hue (0–359) from a string — same id always maps to the same color. */
const hueFromString = (value: string): number => {
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

/**
 * Soft diagonal gradient for the profile-card banner, keyed to the same
 * per-identity hue as the avatar (the second stop shifts the hue for depth).
 * Lightness comes from theme tokens (`--banner-from-l`/`--banner-to-l`) so the
 * tint stays gentle in light mode and dim in dark mode.
 */
export const bannerStyle = (value: string): { backgroundImage: string } => {
    const hue = hueFromString(value);
    return {
        backgroundImage: `linear-gradient(135deg, hsl(${hue} 48% var(--banner-from-l)), hsl(${(hue + 36) % 360} 52% var(--banner-to-l)))`,
    };
};
