import { buildInviteEntryParams } from '../../invite/utils/buildInviteEntryParams';

export const DEFAULT_INVITE_REDIRECT_BASE = 'https://dou-dev.chatic.io/';

export const buildInviteRedirectUrl = (rawInput: string, baseUrl = DEFAULT_INVITE_REDIRECT_BASE): string => {
    let input: URL;
    try {
        input = new URL(rawInput.trim());
    } catch {
        throw new Error('Not a valid URL.');
    }

    const params = buildInviteEntryParams(input.search);
    const base = baseUrl.trim().replace(/\/+$/, '');

    return `${base}/?${params.toString()}`;
};
