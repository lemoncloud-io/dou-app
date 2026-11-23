export interface HeaderProfileInput {
    siteName?: string | null;
    siteImageUrl?: string | null;
    accountName?: string | null;
    accountImageUrl?: string | null;
}

export type HeaderProfile = { kind: 'site' | 'account'; name: string; imageUrl?: string } | { kind: 'setup' };

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
