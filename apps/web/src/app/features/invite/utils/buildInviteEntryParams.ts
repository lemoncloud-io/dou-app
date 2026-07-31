/** AWS region the `_backend` URL is composed for when a link carries `api` + `stage`. */
const AWS_REGION = 'ap-northeast-2';

/**
 * Converts a share link's query string into the invite-entry params the web reads on `/`.
 *
 * This is the single definition of the conversion rule. The `/s` route (`ShareLinkRedirect`) and the
 * debug link converter both call it, so a share link resolves identically however it arrives.
 *
 * Two source forms, distinguished by whether the link carries a backend address at all:
 *
 * - cloud : `code` + (`api` + `stage`, or a ready-made `backend`) → `_backend=<address>`
 * - relay : `code` and no address whatsoever → `relay=1`
 *
 * The relay server has no address to carry, so `api`/`stage`/`backend` are all absent on a relay
 * link — and the `relay` flag is optional, which means the *absence of an address is itself the
 * relay signal*. We detect it here and always emit an explicit `relay=1`, so downstream code still
 * gates on a marker and never has to infer relay from a missing `_backend`.
 *
 * @param search the raw query string (`location.search`), with or without the leading `?`
 * @returns params ready to hang off `/?…` — `code`, `provider`, `version`, and one of `_backend` / `relay`
 * @throws Error when `code` is missing, or the link carries a half-specified cloud address
 */
export const buildInviteEntryParams = (search: string): URLSearchParams => {
    const source = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

    const code = source.get('code');
    const api = source.get('api');
    const stage = source.get('stage');
    const backendParam = source.get('backend');
    // Presence, not value: a bare `&relay` parses to an empty string, so `get()` would read as falsy.
    const hasAddress = !!backendParam || !!api || !!stage;
    const isRelay = source.has('relay') || !hasAddress;

    if (!code) throw new Error('입력 링크에 code 파라미터가 없습니다.');
    // Cloud form only: a ready-made `backend` makes api/stage moot; otherwise both are needed to compose.
    if (!isRelay && !backendParam) {
        if (!api) throw new Error('입력 링크에 api 또는 backend 파라미터가 없습니다.');
        if (!stage) throw new Error('입력 링크에 stage 파라미터가 없습니다.');
    }

    const params = new URLSearchParams();
    params.set('code', code);
    params.set('provider', 'invite');
    params.set('version', '2');
    if (isRelay) {
        params.set('relay', '1');
    } else {
        params.set('_backend', backendParam || `https://${api}.execute-api.${AWS_REGION}.amazonaws.com/${stage}`);
    }

    // Carry anything we did not consume (utm_*, ref, …) so campaign attribution survives the hop.
    const consumed = new Set(['code', 'api', 'stage', 'backend', 'relay']);
    source.forEach((value, key) => {
        if (!consumed.has(key)) params.append(key, value);
    });

    return params;
};
