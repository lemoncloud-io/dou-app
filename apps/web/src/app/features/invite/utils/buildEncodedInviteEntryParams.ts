import { decodeInviteLink } from '@chatic/shared';

/**
 * Converts an encoded invite link's query string into the invite-entry params the web reads on `/`.
 *
 * The sibling of `buildInviteEntryParams`, for the `/i?t=<token>` link format rather than
 * `/s?code=…`. They are kept apart rather than merged: `/s` spreads the target across several
 * params and reads a missing address as the relay signal, while `/i` carries one opaque token with
 * an explicit relay flag inside it. One function serving both would have to hold both rules, and the
 * `/s` rule applied to a `/i` payload sends a coordinate-less cloud invite to the relay server.
 *
 * What the two DO share is their output, and `inviteEntryParity.test.ts` pins that: the same invite,
 * carried either way, produces the same params. That is the property the entry points depend on —
 * everything downstream of here sees one shape.
 *
 * @param search the raw query string (`location.search`), with or without the leading `?`
 * @returns params ready to hang off `/?…` — `code`, `provider`, `version`, and, when the payload
 *          says which, one of `relay` / `_backend`
 * @throws Error when the token is missing, unreadable, or carries no code
 */
export const buildEncodedInviteEntryParams = (search: string): URLSearchParams => {
    const query = search.startsWith('?') ? search : `?${search}`;

    // Handed to the decoder as a relative link: it accepts one, which keeps the origin — something
    // this app has no reason to name — out of the conversion.
    const target = decodeInviteLink(`/i${query}`);
    if (!target) throw new Error('초대 링크의 t 파라미터를 해석할 수 없습니다.');

    const params = new URLSearchParams();
    params.set('code', target.code);
    params.set('provider', 'invite');
    params.set('version', '2');
    if (target.relay) {
        params.set('relay', '1');
    } else if (target.backend) {
        params.set('_backend', target.backend);
    }
    // Neither marker means a cloud invite that arrived without coordinates. It is passed on
    // unmarked rather than guessed at — reading it as relay is the one answer already ruled out.

    // Carry anything the token did not hold (utm_*, ref, …) so campaign attribution survives the hop.
    new URLSearchParams(query.slice(1)).forEach((value, key) => {
        if (key !== 't') params.append(key, value);
    });

    return params;
};
