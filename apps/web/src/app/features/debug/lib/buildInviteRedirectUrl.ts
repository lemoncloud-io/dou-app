/** Default redirect base (current dev domain); editable in the UI. */
export const DEFAULT_INVITE_REDIRECT_BASE = 'https://dou-dev.chatic.io/';

/** API Gateway region the `_backend` URL is composed for. */
const AWS_REGION = 'ap-northeast-2';

/**
 * Converts a share link into the invite-redirect URL. Two source forms are accepted.
 *
 * Cloud (carries the backend address):
 *   Input  : https://<host>/s?code=<code>&api=<api>&stage=<stage>
 *   Output : <base>/?code=<code>&provider=invite&version=2&_backend=<api-gateway url>
 *
 * Relay (needs no backend address — the bare `relay` flag is the discriminator):
 *   Input  : https://<host>/s?code=<code>&relay
 *   Output : <base>/?code=<code>&provider=invite&version=2&relay=1
 *
 * `_backend` is composed from the source link's `api` id and `stage`:
 *   https://<api>.execute-api.<region>.amazonaws.com/<stage>
 * `code` is carried over verbatim; `provider`/`version` are constants. The base host comes from
 * `baseUrl` (not the source link), so a tester can retarget the redirect to any environment.
 *
 * @throws Error when the input is not a valid URL, is missing `code`, or — for the cloud form only —
 *   is missing `api` / `stage`.
 */
export const buildInviteRedirectUrl = (rawInput: string, baseUrl = DEFAULT_INVITE_REDIRECT_BASE): string => {
    let input: URL;
    try {
        input = new URL(rawInput.trim());
    } catch {
        throw new Error('유효한 URL이 아닙니다.');
    }

    const code = input.searchParams.get('code');
    const api = input.searchParams.get('api');
    const stage = input.searchParams.get('stage');
    // Presence, not value: a bare `&relay` parses to an empty string, so `get()` would read as falsy.
    const isRelay = input.searchParams.has('relay');
    if (!code) throw new Error('입력 링크에 code 파라미터가 없습니다.');
    if (!isRelay && !api) throw new Error('입력 링크에 api 파라미터가 없습니다.');
    if (!isRelay && !stage) throw new Error('입력 링크에 stage 파라미터가 없습니다.');

    // Strip any trailing slash from the (editable) base so we always emit a single `/?…`.
    const base = baseUrl.trim().replace(/\/+$/, '');
    // URLSearchParams re-encodes the carried-over `code` (e.g. `:` → %3A) and the `_backend` URL.
    const params = new URLSearchParams();
    params.set('code', code);
    params.set('provider', 'invite');
    params.set('version', '2');
    if (isRelay) {
        // Explicit marker: the web must not have to infer "relay" from an absent `_backend`.
        params.set('relay', '1');
    } else {
        params.set('_backend', `https://${api}.execute-api.${AWS_REGION}.amazonaws.com/${stage}`);
    }

    return `${base}/?${params.toString()}`;
};
