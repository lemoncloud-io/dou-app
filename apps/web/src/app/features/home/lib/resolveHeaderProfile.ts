export interface HeaderProfileInput {
    /** Site-scoped profile name (nick) — used on an active site. */
    siteName?: string | null;
    /** Site-scoped profile image (thumbnail). */
    siteImageUrl?: string | null;
    /** User account profile name ($user.name). */
    accountName?: string | null;
    /** User account profile image ($user.photo). */
    accountImageUrl?: string | null;
}

export type HeaderProfile = { kind: 'site' | 'account'; name: string; imageUrl?: string } | { kind: 'setup' };

/**
 * Resolves the header profile by tier, taking name and image from the same source:
 *  1) the site profile, when its name or image is present;
 *  2) otherwise the user account profile, when its name or image is present;
 *  3) otherwise a "set up your profile" prompt.
 * No cross-source mixing: a tier is chosen as a unit, so an empty field is not
 * back-filled from a lower tier.
 */
export const resolveHeaderProfile = (input: HeaderProfileInput): HeaderProfile => {
    const { siteName, siteImageUrl, accountName, accountImageUrl } = input;

    if (siteName || siteImageUrl) {
        return { kind: 'site', name: siteName ?? '', imageUrl: siteImageUrl ?? undefined };
    }
    if (accountName || accountImageUrl) {
        return { kind: 'account', name: accountName ?? '', imageUrl: accountImageUrl ?? undefined };
    }
    return { kind: 'setup' };
};
