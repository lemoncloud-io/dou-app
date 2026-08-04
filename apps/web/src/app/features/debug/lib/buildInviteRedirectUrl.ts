import { buildInviteEntryParams } from '../../invite/utils/buildInviteEntryParams';

/** Default redirect base (current dev domain); editable in the UI. */
export const DEFAULT_INVITE_REDIRECT_BASE = 'https://dou-dev.chatic.io/';

/**
 * Converts a share link into an absolute invite-redirect URL for manual testing.
 *
 * The conversion rule itself lives in `buildInviteEntryParams` — the same function the `/s` route
 * uses — so this tool cannot drift from what the app actually does. All this adds is the absolute
 * base, which is editable in the UI so a tester can retarget any environment:
 *
 *   Input  : https://<host>/s?code=<code>&api=<api>&stage=<stage>   (cloud)
 *            https://<host>/s?code=<code>&backend=<url>             (cloud, ready-made address)
 *            https://<host>/s?code=<code>[&relay]                   (relay — no address at all)
 *   Output : <base>/?code=<code>&provider=invite&version=2&(_backend=…|relay=1)
 *
 * @throws Error when the input is not a valid URL, is missing `code`, or carries a half-specified
 *   cloud address (e.g. `api` without `stage`).
 */
export const buildInviteRedirectUrl = (rawInput: string, baseUrl = DEFAULT_INVITE_REDIRECT_BASE): string => {
    let input: URL;
    try {
        input = new URL(rawInput.trim());
    } catch {
        throw new Error('유효한 URL이 아닙니다.');
    }

    const params = buildInviteEntryParams(input.search);
    // Strip any trailing slash from the (editable) base so we always emit a single `/?…`.
    const base = baseUrl.trim().replace(/\/+$/, '');

    return `${base}/?${params.toString()}`;
};
