import { decodeInviteLink } from '@chatic/shared';

export const buildEncodedInviteEntryParams = (search: string): URLSearchParams => {
    const query = search.startsWith('?') ? search : `?${search}`;

    const target = decodeInviteLink(`/i${query}`);
    if (!target) throw new Error("Could not decode the invite link's t parameter.");

    const params = new URLSearchParams();
    params.set('code', target.code);
    params.set('provider', 'invite');
    params.set('version', '2');
    if (target.relay) {
        params.set('relay', '1');
    } else if (target.backend) {
        params.set('_backend', target.backend);
    }

    new URLSearchParams(query.slice(1)).forEach((value, key) => {
        if (key !== 't') params.append(key, value);
    });

    return params;
};
